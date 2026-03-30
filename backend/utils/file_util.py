from __future__ import annotations
from config import ALLOWED_UPLOAD_EXTENSIONS,MAX_FILE_BYTES
def validate_upload(content_type: str, file_size: int) -> str | None:
    """
    校验上传文件的格式与大小。
    返回 None 表示合法；否则返回中文错误说明。
    """
    if content_type not in ALLOWED_UPLOAD_EXTENSIONS:
        return (
            f"不支持的文件类型：{content_type}，"
            "当前仅支持 JPG / PNG / PDF"
        )
    if file_size > MAX_FILE_BYTES:
        limit_mb = MAX_FILE_BYTES // 1024 // 1024
        return f"文件大小超过上限 {limit_mb} MB，请分批上传"
    return None
