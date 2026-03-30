# 《论语》前五章
ANALECTS_FIRST_FIVE_CHAPTERS = [
    "学而",
    "为政",
    "八佾",
    "里仁",
    "公冶长",
]
# 允许上传的 MIME 类型
ALLOWED_UPLOAD_EXTENSIONS: frozenset[str] = frozenset({
    "image/jpeg",
    "image/png",
    "application/pdf",
})
# 单文件大小上限：20 MB
MAX_FILE_BYTES: int = 50 * 1024 * 1024
