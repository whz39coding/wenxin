from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
import os

from api.auth import get_current_user
from core.database import db_manager
from core.logger import get_logger
from services.exhibition import ExhibitionService
from services.users import UserRecord

router = APIRouter(prefix="/exhibition", tags=["exhibition"])
logger = get_logger(__name__)


# Pydantic 响应模型
class BookRecordResponse(BaseModel):
    id: int
    filename: str
    char_count: int
    created_at: str


class SlipResponse(BaseModel):
    index: int
    chars: list[str]


class BookPageResponse(BaseModel):
    upload_id: int
    filename: str
    total_chars: int
    total_pages: int
    current_page: int
    slips: list[SlipResponse]


# 构建服务
def _build_service() -> ExhibitionService:
    if db_manager.mysql_engine is None:
        logger.error("展示时,数据库未初始化")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="数据库未初始化",
        )
    return ExhibitionService(db_manager.mysql_engine)


# 获取指定用户已完成OCR的典籍列表
@router.get("/books", response_model=list[BookRecordResponse])
def list_books(
    current_user: UserRecord = Depends(get_current_user),
) -> list[BookRecordResponse]:
    """列出当前用户所有已完成 OCR 的典籍，供竹简阅读器选择。"""
    service = _build_service()
    records = service.list_books_with_text(current_user.id)
    return [BookRecordResponse(**vars(r)) for r in records]


@router.get("/books/{upload_id}", response_model=BookPageResponse)
def get_book_page(
    upload_id: int,
    page: int = Query(default=0, ge=0, description="获取当前页码的竹简内容,页码（0 起始）"),
    slips_per_page: int = Query(default=8, ge=1, le=20, description="每页几个竹简"),
    chars_per_slip: int = Query(
        default=16, ge=4, le=30, description="一个竹简中的文字数"),
    current_user: UserRecord = Depends(get_current_user),
) -> BookPageResponse:
    """返回指定典籍某页的竹简数据。slips[0] 为第一简（最右侧），从右至左阅读。"""
    service = _build_service()
    result = service.get_book_page(
        upload_id, current_user.id, page, slips_per_page, chars_per_slip)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="典籍不存在或尚无识文内容",
        )
    return BookPageResponse(
        upload_id=result.upload_id,
        filename=result.filename,
        total_chars=result.total_chars,
        total_pages=result.total_pages,
        current_page=result.current_page,
        slips=[SlipResponse(index=s.index, chars=s.chars)
               for s in result.slips],
    )
