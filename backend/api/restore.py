from __future__ import annotations

import os
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from api.auth import get_current_user
from config.settings import config
from core.database import db_manager
from core.logger import get_logger
from services.restore import RestoreService
from services.users import UserRecord


router = APIRouter(prefix="/restore", tags=["restore"])
logger = get_logger(__name__)

_restore_service_instance: RestoreService | None = None


class RestoreRequest(BaseModel):
    text: str = Field(min_length=1, max_length=300)


class RestoreSegmentResponse(BaseModel):
    text: str
    restored: bool


class RestoreResponse(BaseModel):
    input_text: str
    restored_text: str
    restored_segments: list[RestoreSegmentResponse]
    evidence: list[str]
    explanation: str
    model: str


def _get_restore_service() -> RestoreService:
    global _restore_service_instance

    if _restore_service_instance is not None:
        return _restore_service_instance

    if db_manager.chroma_client is None:
        logger.error("向量库未初始化")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="向量库未初始化",
        )

    prompt_file_path = os.path.join(config.prompt_dir, "restore_prompt.txt")
    _restore_service_instance = RestoreService(
        chroma_client=db_manager.chroma_client,
        mysql_engine=db_manager.mysql_engine,
        embedding_model_name=config.local_embedding_model,
        collection_prefix=config.knowledge_collection_prefix,
        prompt_file_path=prompt_file_path,
        top_k=config.search_top_k,
    )
    return _restore_service_instance


@router.post("", response_model=RestoreResponse)
def restore_text(
    payload: RestoreRequest,
    current_user: UserRecord = Depends(get_current_user),
) -> RestoreResponse:
    service = _get_restore_service()
    try:
        result = service.restore(
            user_id=current_user.id, text_value=payload.text)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return RestoreResponse(
        input_text=result.input_text,
        restored_text=result.restored_text,
        restored_segments=[
            RestoreSegmentResponse(
                text=segment.text, restored=segment.restored)
            for segment in result.restored_segments
        ],
        evidence=result.evidence,
        explanation=result.explanation,
        model=result.model,
    )
