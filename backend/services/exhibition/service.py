from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import text
from sqlalchemy.engine import Engine
from core.logger import get_logger

logger = get_logger(__name__)

# 将从数据库中查出的记录转化为展示的类型


@dataclass
class BookRecord:
    id: int  # 上传的id
    filename: str
    char_count: int
    created_at: str


@dataclass
class SlipData:
    index: int
    chars: list[str]


# 典籍分页的竹简数据
@dataclass
class BookPage:
    upload_id: int
    filename: str
    total_chars: int
    total_pages: int
    current_page: int
    slips: list[SlipData]


class ExhibitionService:
    """竹简阅读服务：从 uploads 表读取已完成 OCR 的典籍，并按竹简页分片返回。"""

    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    # 列出当前用户所有已完成 OCR 的典籍
    def list_books_with_text(self, user_id: int) -> list[BookRecord]:
        stmt = text(
            """
            SELECT id, filename, extracted_text, created_at
            FROM uploads
            WHERE user_id = :user_id
              AND extracted_text IS NOT NULL
              AND TRIM(extracted_text) != ''
            ORDER BY created_at DESC
            """
        )
        with self.engine.begin() as conn:
            rows = conn.execute(stmt, {"user_id": user_id}).mappings().all()

        result: list[BookRecord] = []
        for row in rows:
            clean = self._clean_text(row["extracted_text"])
            result.append(
                BookRecord(
                    id=row["id"],
                    filename=row["filename"],
                    char_count=len(clean),
                    created_at=(
                        row["created_at"].isoformat()
                        if hasattr(row["created_at"], "isoformat")
                        else str(row["created_at"])
                    ),
                )
            )
        return result

    # 获取某典籍第page页的竹简数据(分页显示)

    def get_book_page(
        self,
        upload_id: int,
        user_id: int,
        page: int,  # 当前页码,因为是分页显示的,所以每一页都通过这个获取内容
        slips_per_page: int = 8,  # 每页的竹简数
        chars_per_slip: int = 16,  # 每个竹简的字数
    ) -> Optional[BookPage]:
        stmt = text(
            """
            SELECT id, filename, extracted_text, created_at
            FROM uploads
            WHERE id = :id AND user_id = :user_id
            LIMIT 1
            """
        )
        with self.engine.begin() as conn:
            row = conn.execute(
                stmt, {"id": upload_id, "user_id": user_id}).mappings().first()

        if not row or not row["extracted_text"]:
            logger.warning("用户 %d 访问了不存在的 OCR 典籍 %d" % (user_id, upload_id))
            return None

        clean = self._clean_text(row["extracted_text"])
        chars_per_page = slips_per_page * chars_per_slip  # 每页的竹简的字数,等于竹简数乘以每个竹简的字数
        total_chars = len(clean)  # 获取总字数
        total_pages = max(1, math.ceil(total_chars / chars_per_page))  # 计算总页数
        page = max(0, min(page, total_pages - 1))  # 获取当前页

        start = page * chars_per_page  # 获取当前页起始字符的索引
        page_text = clean[start: start + chars_per_page]  # 获取当前页的竹简字符串

        slips: list[SlipData] = []
        for i in range(slips_per_page):
            s = i * chars_per_slip
            slip_chars = list(page_text[s: s + chars_per_slip])
            slips.append(SlipData(index=i, chars=slip_chars))

        return BookPage(
            upload_id=upload_id,
            filename=row["filename"],
            total_chars=total_chars,
            total_pages=total_pages,
            current_page=page,
            slips=slips,
        )

    # 清洗文本（去空行、合并行）
    @staticmethod
    def _clean_text(raw: str) -> str:
        """去除纯空白行并合并，保留有效汉字内容。"""
        lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
        return "".join(lines)
