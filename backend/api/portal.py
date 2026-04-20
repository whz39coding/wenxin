from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from core.database import db_manager
from core.logger import get_logger


router = APIRouter(prefix="/portal", tags=["portal"])
logger = get_logger(__name__)


class StatItem(BaseModel):
    label: str
    value: str


class Spotlight(BaseModel):
    source: str
    original: str
    translation: str


class PortalOverviewResponse(BaseModel):
    motto: str
    preface_title: str
    preface: str
    stats: list[StatItem]
    spotlight: Spotlight


def _format_int(value: int) -> str:
    return f"{value:,}"


def _build_dynamic_stats() -> list[StatItem]:
    if db_manager.mysql_engine is None:
        logger.warning("门户统计读取失败：数据库未初始化，返回占位统计")
        return [
            StatItem(label="平台用户", value="0"),
            StatItem(label="收录文档", value="0"),
            StatItem(label="已完成 OCR", value="0"),
            StatItem(label="待处理 OCR", value="0"),
        ]

    statement = text(
        """
        SELECT
            (SELECT COUNT(*) FROM users) AS users_count,
            (SELECT COUNT(*) FROM uploads) AS uploads_count,
            (SELECT COUNT(*) FROM uploads
                WHERE extracted_text IS NOT NULL AND TRIM(extracted_text) != '') AS ocr_done_count,
            (SELECT COUNT(*) FROM uploads
                WHERE extracted_text IS NULL OR TRIM(extracted_text) = '') AS ocr_pending_count
        """
    )

    try:
        with db_manager.mysql_engine.begin() as conn:
            row = conn.execute(statement).mappings().first()
    except Exception as exc:  # noqa: BLE001
        logger.error("门户统计读取异常：%s", str(exc))
        return [
            StatItem(label="平台用户", value="0"),
            StatItem(label="收录文档", value="0"),
            StatItem(label="已完成 OCR", value="0"),
            StatItem(label="待处理 OCR", value="0"),
        ]

    if not row:
        return [
            StatItem(label="平台用户", value="0"),
            StatItem(label="收录文档", value="0"),
            StatItem(label="已完成 OCR", value="0"),
            StatItem(label="待处理 OCR", value="0"),
        ]

    users_count = int(row.get("users_count", 0) or 0)
    uploads_count = int(row.get("uploads_count", 0) or 0)
    ocr_done_count = int(row.get("ocr_done_count", 0) or 0)
    ocr_pending_count = int(row.get("ocr_pending_count", 0) or 0)

    return [
        StatItem(label="平台用户", value=_format_int(users_count)),
        StatItem(label="收录文档", value=_format_int(uploads_count)),
        StatItem(label="已完成 OCR", value=_format_int(ocr_done_count)),
        StatItem(label="待处理 OCR", value=_format_int(ocr_pending_count)),
    ]


@router.get("/overview", response_model=PortalOverviewResponse)
def get_portal_overview() -> PortalOverviewResponse:
    return PortalOverviewResponse(
        motto="采圣贤遗文，续千载文脉；借智能之术，焕古籍新生。",
        preface_title="文脉之引",
        preface=(
            "平台以《论语》为核心语料，融合古籍数字化、OCR 识读、"
            "残篇修复、语义检索与白话今释，构建可持续演进的文献知识空间。"
        ),
        stats=_build_dynamic_stats(),
        spotlight=Spotlight(
            source="《论语·学而》",
            original="学而时习之，不亦说乎？",
            translation="学习之后按时温习，不也令人喜悦吗？",
        ),
    )
