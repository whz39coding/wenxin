from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy import text
from sqlalchemy.engine import Engine


@dataclass
class UserSearchSettingsRecord:
    user_id: int
    api_key: str | None
    model: str | None
    base_url: str | None
    answer_prompt: str | None
    updated_at: datetime


@dataclass
class UserUISettingsRecord:
    user_id: int
    theme_mode: str
    updated_at: datetime


class UserPreferencesService:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    def ensure_tables(self) -> None:
        statement_search = text(
            """
            CREATE TABLE IF NOT EXISTS user_search_settings (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                user_id BIGINT NOT NULL UNIQUE,
                api_key TEXT,
                model VARCHAR(120),
                answer_model VARCHAR(120),
                base_url VARCHAR(512),
                answer_prompt LONGTEXT,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user_search_settings_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )
        statement_ui = text(
            """
            CREATE TABLE IF NOT EXISTS user_ui_settings (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                user_id BIGINT NOT NULL UNIQUE,
                theme_mode VARCHAR(16) NOT NULL DEFAULT 'light',
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user_ui_settings_user_id (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )
        with self.engine.begin() as conn:
            conn.execute(statement_search)
            conn.execute(statement_ui)
            # 向后兼容：老表可能缺少新列，尽力补齐
            try:
                conn.execute(
                    text("ALTER TABLE user_search_settings ADD COLUMN model VARCHAR(120) NULL"))
            except Exception:
                pass
            try:
                conn.execute(
                    text("ALTER TABLE user_search_settings ADD COLUMN base_url VARCHAR(512) NULL"))
            except Exception:
                pass

    def get_search_settings(self, user_id: int) -> Optional[UserSearchSettingsRecord]:
        statement = text(
            """
            SELECT user_id, api_key,
                   model,
                   base_url,
                   answer_model,
                   answer_prompt,
                   updated_at
            FROM user_search_settings
            WHERE user_id = :user_id
            LIMIT 1
            """
        )
        with self.engine.begin() as conn:
            row = conn.execute(
                statement, {"user_id": user_id}).mappings().first()
        if row is None:
            return None
        return UserSearchSettingsRecord(
            user_id=int(row["user_id"]),
            api_key=row.get("api_key"),
            model=row.get("model") or row.get("answer_model"),
            base_url=row.get("base_url"),
            answer_prompt=row.get("answer_prompt"),
            updated_at=row["updated_at"],
        )

    def upsert_search_settings(
        self,
        user_id: int,
        api_key: str | None,
        model: str | None,
        base_url: str | None,
        answer_prompt: str | None,
    ) -> UserSearchSettingsRecord:
        statement = text(
            """
            INSERT INTO user_search_settings (
                user_id, api_key, model, base_url, answer_prompt, answer_model
            ) VALUES (
                :user_id, :api_key, :model, :base_url, :answer_prompt, :answer_model
            )
            ON DUPLICATE KEY UPDATE
                api_key = VALUES(api_key),
                model = VALUES(model),
                base_url = VALUES(base_url),
                answer_prompt = VALUES(answer_prompt),
                answer_model = VALUES(answer_model),
                updated_at = CURRENT_TIMESTAMP
            """
        )
        with self.engine.begin() as conn:
            conn.execute(
                statement,
                {
                    "user_id": user_id,
                    "api_key": (api_key or "").strip() or None,
                    "model": (model or "").strip() or None,
                    "base_url": (base_url or "").strip() or None,
                    "answer_prompt": (answer_prompt or "").strip() or None,
                    "answer_model": (model or "").strip() or None,
                },
            )
        record = self.get_search_settings(user_id)
        if record is None:
            raise RuntimeError("保存问义配置失败")
        return record

    def get_ui_settings(self, user_id: int) -> UserUISettingsRecord:
        statement = text(
            """
            SELECT user_id, theme_mode, updated_at
            FROM user_ui_settings
            WHERE user_id = :user_id
            LIMIT 1
            """
        )
        with self.engine.begin() as conn:
            row = conn.execute(
                statement, {"user_id": user_id}).mappings().first()
        if row is None:
            return UserUISettingsRecord(
                user_id=user_id,
                theme_mode="light",
                updated_at=datetime.now(),
            )
        return UserUISettingsRecord(
            user_id=int(row["user_id"]),
            theme_mode=str(row.get("theme_mode") or "light"),
            updated_at=row["updated_at"],
        )

    def upsert_ui_settings(
        self,
        user_id: int,
        theme_mode: str,
    ) -> UserUISettingsRecord:
        normalized_mode = (theme_mode or "light").strip().lower()
        if normalized_mode not in {"light", "night"}:
            normalized_mode = "light"
        statement = text(
            """
            INSERT INTO user_ui_settings (user_id, theme_mode)
            VALUES (:user_id, :theme_mode)
            ON DUPLICATE KEY UPDATE
                theme_mode = VALUES(theme_mode),
                updated_at = CURRENT_TIMESTAMP
            """
        )
        with self.engine.begin() as conn:
            conn.execute(
                statement,
                {
                    "user_id": user_id,
                    "theme_mode": normalized_mode,
                },
            )
        return self.get_ui_settings(user_id)
