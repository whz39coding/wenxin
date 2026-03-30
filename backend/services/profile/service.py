from __future__ import annotations

import importlib
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.engine import Engine
from core.logger import get_logger

from utils.classical_parser import ClassicalChineseTokenizer, Document
from services.users import UserRecord, UserService

logger = get_logger(__name__)


@dataclass
class ProfileUploadRecord:
    id: int
    user_id: int
    filename: str
    stored_name: str
    content_type: str
    file_size: int
    extracted_text: Optional[str]
    created_at: datetime


class ProfileService:
    def __init__(
        self,
        engine: Engine,
        chroma_client: Any | None,
        upload_dir: str,
        embedding_model_name: str,
        embedding_model_path: str,
        collection_prefix: str,
    ) -> None:
        self.engine = engine
        self.chroma_client = chroma_client
        self.upload_dir = Path(upload_dir)
        self.embedding_model_name = embedding_model_name
        self.embedding_model_path = embedding_model_path
        self.collection_prefix = collection_prefix
        self._encoder = None
        self.tok = ClassicalChineseTokenizer(
            min_len=8,
            max_len=60,
            context_before=2,
            context_after=1,
            keep_notes=False,
        )

    def list_uploads(self, user_id: int) -> list[ProfileUploadRecord]:
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
                statement, {"user_id": user_id}).mappings().all()
        return [self._to_record(row) for row in rows]

    def update_user_profile(
        self,
        user_id: int,
        username: str | None,
        email: str | None,
        current_password: str | None,
        new_password: str | None,
    ) -> UserRecord | None:
        user_service = UserService(self.engine)
        user = user_service.get_by_id(user_id)
        if user is None:
            return None

        next_username = (username or "").strip() or user.username
        next_email = (email or "").strip().lower() or user.email

        if "@" not in next_email:
            raise ValueError("邮箱格式不正确")

        if next_username != user.username:
            existed = user_service.get_by_username(next_username)
            if existed is not None and existed.id != user_id:
                raise ValueError("用户名已存在")

        if next_email != user.email:
            existed = user_service.get_by_email(next_email)
            if existed is not None and existed.id != user_id:
                raise ValueError("邮箱已被注册")

        password_hash = user.password_hash
        normalized_new = (new_password or "").strip()
        if normalized_new:
            normalized_current = (current_password or "").strip()
            if not normalized_current:
                raise ValueError("修改密码需要输入当前密码")
            if not user_service.verify_password(normalized_current, user.password_hash):
                raise ValueError("当前密码不正确")
            if len(normalized_new) < 6:
                raise ValueError("新密码长度至少为6位")
            password_hash = user_service.hash_password(normalized_new)

        statement = text(
            """
            UPDATE users
            SET username = :username,
                email = :email,
                password_hash = :password_hash
            WHERE id = :user_id
            """
        )
        with self.engine.begin() as conn:
            result = conn.execute(
                statement,
                {
                    "user_id": user_id,
                    "username": next_username,
                    "email": next_email,
                    "password_hash": password_hash,
                },
            )

        if result.rowcount == 0:
            return None
        return user_service.get_by_id(user_id)

    def get_upload(self, user_id: int, upload_id: int) -> Optional[ProfileUploadRecord]:
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
                statement, {"id": upload_id, "user_id": user_id}).mappings().first()
        return self._to_record(row) if row else None

    def update_extracted_text(self, user_id: int, upload_id: int, extracted_text: str) -> Optional[ProfileUploadRecord]:
        record = self.get_upload(user_id, upload_id)
        if record is None:
            return None

        cleaned_text = (extracted_text or "").strip()
        if not cleaned_text:
            raise ValueError("识文内容不能为空")

        self._delete_vectors_by_upload(user_id, upload_id)

        # 按需求先清空再写入，确保数据库中始终是最新文本。
        clear_stmt = text(
            """
            UPDATE uploads
            SET extracted_text = NULL
            WHERE id = :id AND user_id = :user_id
            """
        )
        write_stmt = text(
            """
            UPDATE uploads
            SET extracted_text = :extracted_text
            WHERE id = :id AND user_id = :user_id
            """
        )

        with self.engine.begin() as conn:
            conn.execute(clear_stmt, {"id": upload_id, "user_id": user_id})
            result = conn.execute(
                write_stmt,
                {
                    "id": upload_id,
                    "user_id": user_id,
                    "extracted_text": cleaned_text,
                },
            )

        if result.rowcount == 0:
            return None

        chunks = self.tok.split_text(
            text=cleaned_text,
            source=upload_id,
            book_title=record.filename,
        )
        try:
            self._index_to_chroma(
                user_id=user_id,
                upload_id=upload_id,
                filename=record.filename,
                chunks=chunks,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("更新识文后重建向量失败: %s", exc)

        return self.get_upload(user_id, upload_id)

    def delete_upload(self, user_id: int, upload_id: int) -> bool:
        record = self.get_upload(user_id, upload_id)
        if record is None:
            return False

        self._delete_vectors_by_upload(user_id, upload_id)

        statement = text(
            """
            DELETE FROM uploads
            WHERE id = :id AND user_id = :user_id
            """
        )
        with self.engine.begin() as conn:
            result = conn.execute(
                statement, {"id": upload_id, "user_id": user_id})

        if result.rowcount == 0:
            return False

        file_path = self.upload_dir / str(user_id) / record.stored_name
        try:
            if file_path.exists():
                file_path.unlink()
        except Exception as exc:  # noqa: BLE001
            logger.warning("删除本地文件失败: %s", exc)

        return True

    def _delete_vectors_by_upload(self, user_id: int, upload_id: int) -> None:
        """从向量库中删除指定 upload_id 的所有向量。"""
        if self.chroma_client is None:
            logger.warning(
                "向量库未初始化，跳过向量删除: user_id=%s upload_id=%s", user_id, upload_id)
            return

        collection = self.chroma_client.get_or_create_collection(
            name=f"{self.collection_prefix}_{user_id}",
            metadata={"hnsw:space": "cosine"},
        )

        # 策略 1：按 where 条件删除（元数据过滤）
        try:
            # Chroma 的 where 语法：使用 $eq 等运算符
            collection.delete(where={"upload_id": {"$eq": upload_id}})
            logger.info("向量删除成功: user_id=%s upload_id=%s", user_id, upload_id)
            return
        except Exception as exc:
            logger.warning("按 where 条件删除向量失败，尝试按 id 删除: %s", exc)

        # 策略 2：按 id 前缀删除（直接查询并删除）
        try:
            # 查询所有以该 upload_id 开头的 id
            id_prefix = f"upload-{upload_id}-chunk-"
            # 先用一个大范围的 where 条件查询所有相关 id
            results = collection.get(where={"upload_id": {"$eq": upload_id}})
            if results and results.get("ids"):
                ids_to_delete = results["ids"]
                if ids_to_delete:
                    collection.delete(ids=ids_to_delete)
                    logger.info("按 id 删除成功: 删除 %d 条向量", len(ids_to_delete))
                    return
            logger.info("未找到待删除的向量: user_id=%s upload_id=%s",
                        user_id, upload_id)
        except Exception as exc:
            logger.error("按 id 删除向量失败: %s", exc)

    def _index_to_chroma(
        self,
        user_id: int,
        upload_id: int,
        filename: str,
        chunks: list[Document],
    ) -> None:
        if not chunks:
            logger.warning("没有可入库的文本切块")
            return

        if self.chroma_client is None:
            logger.warning(
                "向量库未初始化，跳过向量重建: user_id=%s upload_id=%s", user_id, upload_id)
            return

        encoder = self._get_encoder()
        chunks_str = [chunk.page_content for chunk in chunks]
        embeddings = encoder.encode(
            chunks_str, normalize_embeddings=True).tolist()

        collection = self.chroma_client.get_or_create_collection(
            name=f"{self.collection_prefix}_{user_id}",
            metadata={"hnsw:space": "cosine"},
        )

        ids = [f"upload-{upload_id}-chunk-{idx}" for idx in range(len(chunks))]
        metadatas = [
            {**chunk.metadata, "user_id": user_id,
                "upload_id": upload_id, "chunk_index": idx}
            for idx, chunk in enumerate(chunks)
        ]

        collection.upsert(
            ids=ids,
            documents=chunks_str,
            embeddings=embeddings,
            metadatas=metadatas,
        )

    def _get_encoder(self):
        if self._encoder is not None:
            return self._encoder

        # 强制离线模式，避免启动时访问 HuggingFace。
        # 注意：使用强制赋值而不是 setdefault，确保生效
        import os
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"

        try:
            sentence_module = importlib.import_module("sentence_transformers")
            SentenceTransformer = getattr(
                sentence_module, "SentenceTransformer")
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "缺少 sentence-transformers 依赖，请先安装 requirements.txt") from exc

        self._encoder = SentenceTransformer(
            self.embedding_model_name,
            cache_folder=self.embedding_model_path,
            local_files_only=True,
        )
        return self._encoder

    @staticmethod
    def _to_record(row: Any) -> ProfileUploadRecord:
        return ProfileUploadRecord(
            id=int(row["id"]),
            user_id=int(row["user_id"]),
            filename=str(row["filename"]),
            stored_name=str(row["stored_name"]),
            content_type=str(row["content_type"]),
            file_size=int(row["file_size"]),
            extracted_text=row.get("extracted_text", None),
            created_at=row["created_at"],
        )
