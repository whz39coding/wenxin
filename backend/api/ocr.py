from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from api.auth import get_current_user
from config.settings import config
from core.database import db_manager
from core.logger import get_logger
from services.ocr import OCRService
from services.upload_book import UploadService
from services.users import UserRecord

router = APIRouter(prefix="/ocr", tags=["ocr"])
logger = get_logger(__name__)

# 全局 OCR 服务单例
_ocr_service_instance: OCRService | None = None

# OCR 响应结果定义


class OCRResponse(BaseModel):
    upload_id: int  # 上传 ID
    text: str  # OCR 提取的文本
    model: str  # 使用的 OCR 模型


def _get_ocr_service() -> OCRService:
    """获取全局 OCR 服务单例。首次调用时创建，之后复用。"""
    global _ocr_service_instance

    if _ocr_service_instance is not None:
        return _ocr_service_instance

    if db_manager.mysql_engine is None:
        logger.error("数据库未初始化")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="数据库未初始化",
        )
    if db_manager.chroma_client is None:
        logger.error("向量库未初始化")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="向量库未初始化",
        )

    upload_service = UploadService(db_manager.mysql_engine, config.upload_dir)
    logger.info("构建 OCR 服务单例成功")
    _ocr_service_instance = OCRService(
        upload_service=upload_service,
        chroma_client=db_manager.chroma_client,
        embedding_model_name=config.local_embedding_model,
        collection_prefix=config.knowledge_collection_prefix,
    )
    return _ocr_service_instance

# 从未被OCR的下拉菜单中选择一个,获取他的upload_id调用这个函数,进行OCR文本识别


@router.post("/{upload_id}", response_model=OCRResponse)
def recognize_upload(
    upload_id: int,
    current_user: UserRecord = Depends(get_current_user),
) -> OCRResponse:
    service = _get_ocr_service()
    try:
        result = service.recognize_upload(current_user.id, upload_id)
    except FileNotFoundError as exc:
        logger.error("未找到上传文件: user_id=%s upload_id=%s detail=%s",
                     current_user.id, upload_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        logger.error("OCR 业务校验失败: user_id=%s upload_id=%s detail=%s",
                     current_user.id, upload_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.error("OCR 运行失败: user_id=%s upload_id=%s detail=%s",
                     current_user.id, upload_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    logger.info(f"{upload_id} OCR 提取完成")
    return OCRResponse(upload_id=result.upload_id, text=result.text, model=result.model)
