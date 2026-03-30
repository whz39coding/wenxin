from __future__ import annotations

import json
import os
import queue
import threading
import time
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.auth import get_current_user
from config.settings import config
from core.database import db_manager
from core.logger import get_logger
from services.search import SearchService
from services.users import UserRecord


router = APIRouter(prefix="/search", tags=["search"])
logger = get_logger(__name__)

# 全局搜索服务单例
_search_service_instance: SearchService | None = None

# 问义请求参数


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=200)

# 搜索结果条目类型


class SearchItemResponse(BaseModel):
    source: str
    original: str
    translation: str
    chapter: str
    score: float

# 返回给前端搜索结果响应类型


class SearchResponse(BaseModel):
    query: str
    answer: str
    references: list[str]
    model: str
    results: list[SearchItemResponse]


def _get_search_service() -> SearchService:
    """获取全局搜索服务单例。首次调用时创建，之后复用。"""
    global _search_service_instance

    if _search_service_instance is not None:
        return _search_service_instance

    if db_manager.chroma_client is None:
        logger.error("向量库未初始化")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="向量库未初始化",
        )

    prompt_file_path = os.path.join(config.prompt_dir, 'search_prompt.txt')
    translate_prompt_file_path = os.path.join(
        config.prompt_dir, 'search_translate_prompt.txt'
    )
    logger.info(f"构建问义服务单例，使用模型：{config.open_api_model[:5]}")
    _search_service_instance = SearchService(
        chroma_client=db_manager.chroma_client,
        mysql_engine=db_manager.mysql_engine,
        embedding_model_name=config.local_embedding_model,
        collection_prefix=config.knowledge_collection_prefix,
        prompt_file_path=prompt_file_path,
        translate_prompt_file_path=translate_prompt_file_path,
        top_k=config.search_top_k,
    )
    return _search_service_instance


@router.post("", response_model=SearchResponse)
def search_classics(
    payload: SearchRequest,
    current_user: UserRecord = Depends(get_current_user),
) -> SearchResponse:
    service = _get_search_service()

    try:
        result = service.search(user_id=current_user.id, query=payload.query)
    except ValueError as exc:
        logger.error(f'出现了错误.422:{exc}')
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        logger.error(f'出现了错误.500:{exc}')
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    logger.info(f"问义返回结果成功")
    return SearchResponse(
        query=result.query,
        answer=result.answer,
        references=result.references,
        model=result.model,
        results=[
            SearchItemResponse(
                source=item.source,
                original=item.original,
                translation=item.translation,
                chapter=item.chapter,
                score=item.score,
            )
            for item in result.results
        ],
    )


@router.post("/stream", response_class=StreamingResponse)
def search_classics_stream(
    payload: SearchRequest,
    current_user: UserRecord = Depends(get_current_user),
):
    """
    流式搜索端点，返回Server-Sent Events格式的进度更新。

    返回的事件格式:
        data: {"type": "encoding", "data": {...}}
        data: {"type": "retrieving", "data": {...}}
        data: {"type": "retrieved", "data": {"count": N, "message": "..."}}
        data: {"type": "calling_llm", "data": {...}}
        data: {"type": "completed", "data": {...}}
        data: {"type": "result", "data": {...full result...}}
    """

    def event_generator():
        service = _get_search_service()
        event_queue: queue.Queue[dict] = queue.Queue()
        done_event = threading.Event()
        state: dict[str, object] = {"result": None, "error": None}

        def on_progress(event_type: str, data: dict):
            event_queue.put({"type": event_type, "data": data})

        def worker():
            try:
                final_result = service.search_with_progress(
                    user_id=current_user.id,
                    query=payload.query,
                    on_progress=on_progress,
                )
                state["result"] = final_result
            except Exception as exc:
                state["error"] = exc
            finally:
                done_event.set()

        threading.Thread(target=worker, daemon=True).start()

        try:
            while not done_event.is_set() or not event_queue.empty():
                try:
                    event = event_queue.get(timeout=0.2)
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                except queue.Empty:
                    # 发送注释保活，避免部分代理长连接超时
                    yield ": keep-alive\n\n"

            error = state.get("error")
            if error is not None:
                raise error

            final_result = state.get("result")
            if final_result is None:
                raise RuntimeError("搜索未返回结果")

            # 搜索完成后，发送完整结果
            result_data = {
                "type": "result",
                "data": {
                    "query": final_result.query,
                    "answer": final_result.answer,
                    "references": final_result.references,
                    "model": final_result.model,
                    "results": [
                        {
                            "source": item.source,
                            "original": item.original,
                            "translation": item.translation,
                            "chapter": item.chapter,
                            "score": item.score,
                        }
                        for item in final_result.results
                    ]
                }
            }
            yield f"data: {json.dumps(result_data, ensure_ascii=False)}\n\n"

        except ValueError as exc:
            logger.error(f'搜索参数错误: {exc}')
            error_data = {
                "type": "error",
                "data": {"error": str(exc), "status": 422}
            }
            yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"

        except Exception as exc:
            logger.error(f'搜索执行错误: {exc}')
            error_data = {
                "type": "error",
                "data": {"error": str(exc), "status": 500}
            }
            yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
