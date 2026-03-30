from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

import bcrypt
from sqlalchemy import text
from sqlalchemy.engine import Engine
from core.logger import get_logger

logger = get_logger(__name__)

# 定义数据模型,数据库查询得到数据转为的用户对象类型


@dataclass
class UserRecord:
    id: int
    username: str
    email: str
    password_hash: str
    created_at: datetime


class UserService:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    # 确保数据表存在,如果不存在则创建
    def ensure_user_table(self) -> None:
        statement = text(
            """
            CREATE TABLE IF NOT EXISTS users (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(64) NOT NULL UNIQUE,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """
        )
        with self.engine.begin() as conn:
            conn.execute(statement)

    # 通过邮箱获取用户
    def get_by_email(self, email: str) -> Optional[UserRecord]:
        statement = text(
            """
            SELECT id, username, email, password_hash, created_at
            FROM users
            WHERE email = :email
            LIMIT 1
            """
        )
        with self.engine.begin() as conn:
            row = conn.execute(statement, {"email": email}).mappings().first()
        return self._to_user(row)
    # 通过用户名获取用户

    def get_by_username(self, username: str) -> Optional[UserRecord]:
        statement = text(
            """
            SELECT id, username, email, password_hash, created_at
            FROM users
            WHERE username = :username
            LIMIT 1
            """
        )
        with self.engine.begin() as conn:
            row = conn.execute(
                statement, {"username": username}).mappings().first()
        return self._to_user(row)
    # 通过邮箱或用户名获取用户

    def get_by_identifier(self, identifier: str) -> Optional[UserRecord]:
        statement = text(
            """
            SELECT id, username, email, password_hash, created_at
            FROM users
            WHERE LOWER(email) = LOWER(:identifier) OR username = :identifier
            LIMIT 1
            """
        )
        with self.engine.begin() as conn:
            row = conn.execute(
                statement, {"identifier": identifier}).mappings().first()
        return self._to_user(row)

    # 通过id获取用户
    def get_by_id(self, user_id: int) -> Optional[UserRecord]:
        statement = text(
            """
            SELECT id, username, email, password_hash, created_at
            FROM users
            WHERE id = :user_id
            LIMIT 1
            """
        )
        with self.engine.begin() as conn:
            row = conn.execute(
                statement, {"user_id": user_id}).mappings().first()
        return self._to_user(row)
    # 创建用户

    def create_user(self, username: str, email: str, password: str) -> UserRecord:
        password_hash = self.hash_password(password)
        statement = text(
            """
            INSERT INTO users (username, email, password_hash)
            VALUES (:username, :email, :password_hash)
            """
        )
        with self.engine.begin() as conn:
            result = conn.execute(
                statement,
                {
                    "username": username,
                    "email": email,
                    "password_hash": password_hash,
                },
            )
            user_id = int(result.lastrowid)

        user = self.get_by_id(user_id)
        if user is None:
            raise RuntimeError("User creation failed")
        return user
    # 将用户输入的密码进行哈希处理生成密码哈希

    @staticmethod
    def hash_password(password: str) -> str:
        password_bytes = password.encode("utf-8")
        hashed = bcrypt.hashpw(
            password_bytes, bcrypt.gensalt())  # 密码 + 盐 产生哈希值
        return hashed.decode("utf-8")

    # 登录时验证用户输入的密码,和数据库保存的密码哈希值是否一致
    @staticmethod
    def verify_password(password: str, password_hash: str) -> bool:
        try:
            return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
        except ValueError:
            return False
    # 将数据库结果转换为用户对象

    @staticmethod
    def _to_user(row: Optional[Any]) -> Optional[UserRecord]:
        if row is None:
            return None
        return UserRecord(
            id=int(row["id"]),
            username=str(row["username"]),
            email=str(row["email"]),
            password_hash=str(row["password_hash"]),
            created_at=row["created_at"],
        )
