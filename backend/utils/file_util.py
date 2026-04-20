from __future__ import annotations
from pathlib import Path

from config import ALLOWED_UPLOAD_EXTENSIONS, MAX_FILE_BYTES


def validate_upload(content_type: str, file_size: int, filename: str = "") -> str | None:
    """
    校验上传文件的格式与大小。
    返回 None 表示合法；否则返回中文错误说明。
    """
    normalized_content_type = (content_type or "").strip().lower()
    lower_name = (filename or "").strip().lower()
    is_txt_by_name = lower_name.endswith(".txt")
    txt_mime_fallbacks = {"", "application/octet-stream", "text/plain"}

    is_allowed = normalized_content_type in ALLOWED_UPLOAD_EXTENSIONS
    if not is_allowed and is_txt_by_name and normalized_content_type in txt_mime_fallbacks:
        is_allowed = True

    if not is_allowed:
        return (
            f"不支持的文件类型：{content_type}，"
            "当前仅支持 JPG / PNG / PDF / TXT"
        )
    if file_size > MAX_FILE_BYTES:
        limit_mb = MAX_FILE_BYTES // 1024 // 1024
        return f"文件大小超过上限 {limit_mb} MB，请分批上传"
    return None
