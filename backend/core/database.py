import logging
from pathlib import Path
from typing import Any, Optional

try:
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import Engine
except ImportError:  # pragma: no cover - dependency may be installed later
    create_engine = None
    text = None
    Engine = Any

try:
    import chromadb
except ImportError:  # pragma: no cover - dependency may be installed later
    chromadb = None

from core.logger import get_logger

logger = get_logger(__name__)


def _is_placeholder(value: str) -> bool:
    upper = value.upper()
    return "YOUR_" in upper or "PLACEHOLDER" in upper or not value.strip()


class DatabaseManager:
    def __init__(self) -> None:
        self.mysql_engine: Optional[Any] = None
        self.chroma_client: Optional[Any] = None
        self.mysql_ready: bool = False
        self.chroma_ready: bool = False

    def init_mysql(self, mysql_url: str) -> bool:
        if any(
            _is_placeholder(part)
            for part in [
                mysql_url,
            ]
        ):
            logger.warning("MySQL config is placeholder, skip connection.")
            self.mysql_ready = False
            return False

        if create_engine is None or text is None:
            logger.warning(
                "SQLAlchemy not installed, skip MySQL initialization.")
            self.mysql_ready = False
            return False

        try:
            # 创建引擎
            self.mysql_engine = create_engine(
                mysql_url, pool_pre_ping=True, future=True)

            # 显式测试连接
            with self.mysql_engine.connect() as conn:
                result = conn.execute(text("SELECT 1"))
                # 确保实际获取结果
                row = result.fetchone()
                if row is None:
                    raise Exception("无法获取数据库测试查询结果")

            logger.info("MySQL connection established successfully")
            self.mysql_ready = True
            return True
        except Exception as exc:  # noqa: BLE001
            logger.error("MySQL initialization failed: %s", exc)  # 改为 error 级别
            self.mysql_engine = None
            self.mysql_ready = False
            return False

    def init_chroma(self, persist_dir: str) -> bool:
        if _is_placeholder(persist_dir):
            logger.warning(
                "Chroma persist dir is placeholder, skip initialization.")
            self.chroma_ready = False
            return False

        if chromadb is None:
            logger.warning(
                "chromadb not installed, skip Chroma initialization.")
            self.chroma_ready = False
            return False

        try:
            target = Path(persist_dir)
            target.mkdir(parents=True, exist_ok=True)
            self.chroma_client = chromadb.PersistentClient(path=str(target))
            self.chroma_ready = True
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("Chroma initialization failed: %s", exc)
            self.chroma_client = None
            self.chroma_ready = False
            return False

    def initialize(self, mysql_url: str, chroma_persist_dir: str) -> None:
        self.init_mysql(mysql_url)
        self.init_chroma(chroma_persist_dir)

    def close(self) -> None:
        if self.mysql_engine is not None:
            self.mysql_engine.dispose()
        self.mysql_engine = None
        self.chroma_client = None
        self.mysql_ready = False
        self.chroma_ready = False


db_manager = DatabaseManager()
