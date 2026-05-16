from __future__ import annotations

import argparse
import json
import sys

from config.settings import config
from core.database import db_manager
from core.logger import get_logger
from services.ocr import OCRService
from services.upload_book import UploadService


logger = get_logger(__name__)
RESULT_PREFIX = "OCR_WORKER_RESULT="


def _emit(payload: dict) -> None:
    print(f"{RESULT_PREFIX}{json.dumps(payload, ensure_ascii=False)}")


def _build_service() -> OCRService:
    db_manager.initialize(
        mysql_url=config.mysql_url,
        chroma_persist_dir=config.chroma_persist_dir,
    )
    if db_manager.mysql_engine is None:
        raise RuntimeError("数据库未初始化")
    if db_manager.chroma_client is None:
        raise RuntimeError("向量库未初始化")

    upload_service = UploadService(db_manager.mysql_engine, config.upload_dir)
    return OCRService(
        upload_service=upload_service,
        chroma_client=db_manager.chroma_client,
        embedding_model_name=config.local_embedding_model,
        collection_prefix=config.knowledge_collection_prefix,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run OCR in isolated process")
    parser.add_argument("--user-id", type=int, required=True)
    parser.add_argument("--upload-id", type=int, required=True)
    args = parser.parse_args()

    try:
        service = _build_service()
        result = service.recognize_upload(args.user_id, args.upload_id)
        _emit(
            {
                "ok": True,
                "upload_id": result.upload_id,
                "text": result.text,
                "model": result.model,
                "chunk_count": result.chunk_count,
            }
        )
        return 0
    except Exception as exc:
        logger.error("OCR worker failed: %s", exc)
        _emit(
            {
                "ok": False,
                "error_type": exc.__class__.__name__,
                "error": str(exc),
            }
        )
        return 1
    finally:
        db_manager.close()


if __name__ == "__main__":
    sys.exit(main())
