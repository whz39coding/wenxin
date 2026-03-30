from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.engine import Engine
import os
from core.logger import get_logger

logger = get_logger(__name__)

# 将前端得到的参数转为的数据库模型


@dataclass
class UploadRecord:
    id: int
    user_id: int
    filename: str           # 用户上传时的原始文件名
    stored_name: str        # 磁盘上实际存储的文件名（UUID + 后缀）
    content_type: str       # MIME 类型，如 image/jpeg
    file_size: int          # 字节数
    extracted_text: Optional[str]   # OCR 阶段填充，初始为 None
    created_at: datetime


# 上传服务
class UploadService:
    def __init__(self, engine: Engine, upload_dir: str) -> None:
        self.engine = engine
        self.upload_dir = Path(upload_dir)

    # 确保数据表存在，不存在则创建上传数据相关的表格
    def ensure_upload_table(self) -> None:
        statement = text(
            """
            CREATE TABLE IF NOT EXISTS uploads (
                id          BIGINT       PRIMARY KEY AUTO_INCREMENT,
                user_id     BIGINT       NOT NULL,
                filename    VARCHAR(255) NOT NULL,
                stored_name VARCHAR(255) NOT NULL,
                content_type VARCHAR(100) NOT NULL,
                file_size   BIGINT       NOT NULL,
                extracted_text LONGTEXT,
                created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_uploads_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )
        with self.engine.begin() as conn:
            conn.execute(statement)

    # 将上传的文件存入本地，并返回上传记录
    def save_file(
        self,
        user_id: int,
        filename: str,
        content_type: str,
        data: bytes,
    ) -> UploadRecord:
        """将文件写入磁盘，并向数据库插入一条上传记录。"""
        # 按用户 id 分子目录，避免文件名碰撞
        user_dir = self.upload_dir / str(user_id)
        user_dir.mkdir(parents=True, exist_ok=True)

        # 生成唯一存储名：uuid + 原始后缀
        suffix = Path(filename).suffix
        stored_name = f"{uuid.uuid4().hex}{suffix}"
        file_path = user_dir / stored_name

        file_path.write_bytes(data)

        statement = text(
            """
            INSERT INTO uploads (user_id, filename, stored_name, content_type, file_size)
            VALUES (:user_id, :filename, :stored_name, :content_type, :file_size)
            """
        )
        with self.engine.begin() as conn:
            result = conn.execute(
                statement,
                {
                    "user_id": user_id,
                    "filename": filename,
                    "stored_name": stored_name,
                    "content_type": content_type,
                    "file_size": len(data),
                },
            )
            record_id = result.lastrowid

        record = self.get_by_id(record_id, user_id)
        assert record is not None
        return record

    # 根据用户id获取用户所有上传记录
    def list_by_user(self, user_id: int) -> list[UploadRecord]:
        """返回某用户所有上传记录，按创建时间倒序。"""
        statement = text(
            """
            SELECT id, user_id, filename, stored_name, content_type,
                   file_size, extracted_text, created_at
            FROM uploads
            WHERE user_id = :user_id
            ORDER BY created_at DESC
            """
        )
        with self.engine.begin() as conn:
            rows = conn.execute(
                # 将结果映射为字典,返回的是一个列表,元素是字典
                statement, {"user_id": user_id}).mappings().all()
        # 将每一个字典转为上传记录数据类型,组成一个列表.
        return [self._to_record(row) for row in rows]

    # 从该用户上传过的文件中获取尚未完成 OCR 的上传记录,返回给OCR页面进行识别
    def list_unocr_by_user(self, user_id: int) -> list[UploadRecord]:
        """返回尚未完成 OCR 的上传记录（extracted_text 为空）。"""
        statement = text(
            """
            SELECT id, user_id, filename, stored_name, content_type,
                   file_size, extracted_text, created_at
            FROM uploads
            WHERE user_id = :user_id
              AND (extracted_text IS NULL OR TRIM(extracted_text) = '')
            ORDER BY created_at DESC
            """
        )
        with self.engine.begin() as conn:
            rows = conn.execute(
                statement, {"user_id": user_id}).mappings().all() # 将结果映射为字典
        return [self._to_record(row) for row in rows] # 可能上传了多条 

    # 根据上传记录id 和 用户id 查询上传记录
    def get_by_id(self, upload_id: int, user_id: int) -> Optional[UploadRecord]:
        """按 id + user_id 查询（防止越权访问他人文件）。"""
        statement = text(
            """
            SELECT id, user_id, filename, stored_name, content_type,
                   file_size, extracted_text, created_at
            FROM uploads
            WHERE id = :id AND user_id = :user_id
            LIMIT 1
            """
        )
        with self.engine.begin() as conn:
            row = conn.execute(
                statement, {"id": upload_id, "user_id": user_id}
            ).mappings().first()  # 只查询第一个
        return self._to_record(row) if row else None

    # 获取某个用户传输过的一个文件路径,即本地的存储路径
    def get_file_path(self, upload_id: int, user_id: int) -> Optional[Path]:
        """返回文件在磁盘上的绝对路径，记录不存在或文件丢失时返回 None。"""
        record = self.get_by_id(upload_id, user_id)
        if record is None:
            return None
        path = self.upload_dir / str(user_id) / record.stored_name
        logger.info(path)
        return path if path.exists() else None

    # 将OCR识别的结果写入数据库,以防被重复识别
    def set_extracted_text(self, upload_id: int, user_id: int, extracted_text: str) -> Optional[UploadRecord]:
        """写回 OCR 结果，并返回最新记录。"""
        statement = text(
            """
            UPDATE uploads
            SET extracted_text = :extracted_text
            WHERE id = :id AND user_id = :user_id
            """
        )
        with self.engine.begin() as conn:
            result = conn.execute(
                statement,
                {
                    "id": upload_id,
                    "user_id": user_id,
                    "extracted_text": extracted_text,
                },
            )
        if result.rowcount == 0:
            return None
        return self.get_by_id(upload_id, user_id)

    # 将查询到的数据库记录转为上传记录数据类型
    @staticmethod
    def _to_record(row: Any) -> UploadRecord:
        return UploadRecord(
            id=row["id"],
            user_id=row["user_id"],
            filename=row["filename"],
            stored_name=row["stored_name"],
            content_type=row["content_type"],
            file_size=row["file_size"],
            extracted_text=row.get("extracted_text", None),
            created_at=row["created_at"],
        )
