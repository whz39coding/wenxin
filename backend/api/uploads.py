from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from api.auth import get_current_user
from config.settings import config
from core.database import db_manager
from services.upload_book import UploadRecord, UploadService
from services.users import UserRecord
from utils.file_util import validate_upload
from core.logger import get_logger
logger = get_logger(__name__)

router = APIRouter(prefix="/uploads", tags=["uploads"])


# 定义上传成功后的响应类型
class UploadResponse(BaseModel):
    id: int
    filename: str
    content_type: str
    preview_mode: str
    file_size: int
    extracted_text: str | None
    created_at: str


# 构建上传服务
def _build_upload_service() -> UploadService:
    if db_manager.mysql_engine is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="数据库未初始化",
        )
    return UploadService(db_manager.mysql_engine, config.upload_dir)

# 将上传记录转换为响应


def _to_upload_response(record: UploadRecord) -> UploadResponse:
    preview_mode = _resolve_preview_mode(record.content_type)
    return UploadResponse(
        id=record.id,
        filename=record.filename,
        content_type=record.content_type,
        preview_mode=preview_mode,
        file_size=record.file_size,
        extracted_text=record.extracted_text,
        created_at=(
            record.created_at.isoformat()
            if hasattr(record.created_at, "isoformat")
            else str(record.created_at)
        ),
    )


def _resolve_preview_mode(content_type: str) -> str:
    if content_type.startswith("image/"):
        return "image"
    if content_type == "application/pdf":
        return "pdf"
    return "unsupported"


# 路由
# 上传文件,且把内容保存到本地文件夹中便于后续识别处理
@router.post("", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    current_user: UserRecord = Depends(get_current_user),
) -> UploadResponse:
    """上传单个卷页文件（JPG / PNG / WebP / PDF），大小上限 20 MB。"""
    data = await file.read()
    content_type = file.content_type or ""

    error = validate_upload(content_type, len(data))
    if error:
        logger.error("上传文件失败: {error}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=error
        )

    service = _build_upload_service()
    record = service.save_file(
        user_id=current_user.id,
        filename=file.filename or "upload",
        content_type=content_type,
        data=data,
    )
    logger.info(
        f"用户 {current_user.id} 上传文件成功: {record.filename} ({record.file_size} bytes)")
    return _to_upload_response(record)

# 获取当前登录用户的所有的上传记录


@router.get("", response_model=list[UploadResponse])
def list_uploads(
    current_user: UserRecord = Depends(get_current_user),
) -> list[UploadResponse]:
    """获取当前用户的所有上传记录，按时间倒序。"""
    service = _build_upload_service()
    records = service.list_by_user(current_user.id)
    return [_to_upload_response(r) for r in records]


@router.get("/unocr", response_model=list[UploadResponse])
def list_unocr_uploads(
    current_user: UserRecord = Depends(get_current_user),
) -> list[UploadResponse]:
    """获取当前用户尚未完成 OCR 的上传记录，按时间倒序。"""
    service = _build_upload_service()
    records = service.list_unocr_by_user(current_user.id)
    return [_to_upload_response(r) for r in records]

# 获取上传的某个文件的内容,可触发pdf下载


@router.get("/{upload_id}/content")
def get_upload_content(
    upload_id: int,
    current_user: UserRecord = Depends(get_current_user),
) -> FileResponse:
    """返回已上传文件的原始内容（图片与 PDF 均支持页面内展示）。"""
    service = _build_upload_service()

    record = service.get_by_id(upload_id, current_user.id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文件不存在或无权访问",
        )

    file_path = service.get_file_path(upload_id, current_user.id)
    if file_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="文件已损坏或被移除",
        )

    return FileResponse(
        path=str(file_path),
        media_type=record.content_type,
    )
