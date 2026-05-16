from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from api.auth import get_current_user
from core.database import db_manager
from core.logger import get_logger
from services.users import UserRecord

router = APIRouter(prefix="/ocr", tags=["ocr"])
logger = get_logger(__name__)

_WORKER_RESULT_PREFIX = "OCR_WORKER_RESULT="

# OCR 响应结果定义


class OCRResponse(BaseModel):
    upload_id: int  # 上传 ID
    text: str  # OCR 提取的文本
    model: str  # 使用的 OCR 模型


def _run_ocr_in_subprocess(user_id: int, upload_id: int) -> dict:
    """在独立进程执行 OCR，进程结束后由操作系统回收内存。"""
    if db_manager.mysql_engine is None:
        logger.error("数据库未初始化")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="数据库未初始化",
        )
    if db_manager.chroma_client is None:
        logger.error("向量库未初始化")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="向量库未初始化",
        )

    backend_dir = Path(__file__).resolve().parents[1]
    command = [
        sys.executable,
        "-m",
        "services.ocr.worker",
        "--user-id",
        str(user_id),
        "--upload-id",
        str(upload_id),
    ]

    timeout_seconds = 200
    try:
        completed = subprocess.run(
            command,
            cwd=str(backend_dir),
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        logger.error("OCR 子进程超时: user_id=%s upload_id=%s", user_id, upload_id)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="OCR执行超时，请拆分文件后重试",
        ) from exc
    except Exception as exc:
        logger.error("OCR 子进程启动失败: user_id=%s upload_id=%s detail=%s",
                     user_id, upload_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OCR子进程启动失败",
        ) from exc

    worker_payload: dict | None = None
    for line in reversed((completed.stdout or "").splitlines()):
        if line.startswith(_WORKER_RESULT_PREFIX):
            raw = line[len(_WORKER_RESULT_PREFIX):].strip()
            try:
                worker_payload = json.loads(raw)
            except json.JSONDecodeError:
                worker_payload = None
            break

    if worker_payload is None:
        logger.error(
            "OCR 子进程返回格式无效: code=%s stderr=%s",
            completed.returncode,
            (completed.stderr or "")[:500],
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OCR进程返回无效结果",
        )

    if worker_payload.get("ok"):
        return worker_payload

    error_type = str(worker_payload.get("error_type") or "RuntimeError")
    error_message = str(worker_payload.get("error") or "OCR执行失败")

    if error_type == "FileNotFoundError":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=error_message)
    if error_type == "ValueError":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=error_message)
    if completed.returncode == 124:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=error_message)

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=error_message,
    )

# 从未被OCR的下拉菜单中选择一个,获取他的upload_id调用这个函数,进行OCR文本识别


@router.post("/{upload_id}", response_model=OCRResponse)
def recognize_upload(
    upload_id: int,
    current_user: UserRecord = Depends(get_current_user),
) -> OCRResponse:
    try:
        payload = _run_ocr_in_subprocess(current_user.id, upload_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("OCR 路由异常: user_id=%s upload_id=%s detail=%s",
                     current_user.id, upload_id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OCR服务异常",
        ) from exc

    logger.info(f"{upload_id} OCR 提取完成")
    return OCRResponse(
        upload_id=int(payload.get("upload_id") or upload_id),
        text=str(payload.get("text") or ""),
        model=str(payload.get("model") or "unknown"),
    )
