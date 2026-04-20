import os
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = os.path.join(BASE_DIR, ".env")
load_dotenv(ENV_PATH)


def _get_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

@dataclass(frozen=True)
class Settings:
    app_name: str
    app_version: str
    app_env: str
    debug: bool

    mysql_host: str
    mysql_port: int
    mysql_user: str
    mysql_password: str
    mysql_database: str

    chroma_persist_dir: str
    upload_dir: str          # 文件上传本地存储根目录

    jwt_secret_key: str
    jwt_algorithm: str
    jwt_expire_minutes: int

    open_api_key: str
    open_api_url: str
    open_api_model: str
    open_translate_api_model: str
    prompt_dir: str
    search_top_k: int

    local_embedding_model: str
    knowledge_collection_prefix: str
    embedding_model_path: str
    ocr_model_path: str

    # 日志配置
    log_level: str
    log_dir: str
    log_max_bytes: int
    log_backup_count: int

    # ocr识别配置
    ocr_max_image_pixels: int
    ocr_max_image_width: int
    ocr_max_image_height: int
    ocr_pdf_render_scale: float
    ocr_pdf_max_pages : int

    @property
    def mysql_url(self) -> str:
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"
        )


config = Settings(
    app_name=os.getenv("APP_NAME", "WenXinClassics Backend"),
    app_version=os.getenv("APP_VERSION", "0.1.0"),
    app_env=os.getenv("APP_ENV", "development"),
    debug=_get_bool("DEBUG", default=True),
    mysql_host=os.getenv("MYSQL_HOST", "YOUR_MYSQL_HOST"),
    mysql_port=int(os.getenv("MYSQL_PORT", "3306")),
    mysql_user=os.getenv("MYSQL_USER", "YOUR_MYSQL_USER"),
    mysql_password=os.getenv("MYSQL_PASSWORD", "YOUR_MYSQL_PASSWORD"),
    mysql_database=os.getenv("MYSQL_DATABASE", "YOUR_MYSQL_DATABASE"),
    chroma_persist_dir=os.path.join(BASE_DIR, "data", "chroma"),
    upload_dir=os.path.join(BASE_DIR, "data", "uploads"),
    jwt_secret_key=os.getenv("JWT_SECRET_KEY", "YOUR_JWT_SECRET_KEY"),
    jwt_algorithm=os.getenv("JWT_ALGORITHM", "HS256"),
    jwt_expire_minutes=int(os.getenv("JWT_EXPIRE_MINUTES", "60")),
    open_api_key=os.getenv("OPENAI_API_KEY", "YOUR_OPEN_API_KEY"),
    open_api_url=os.getenv("OPENAI_API_URL", "YOUR_OPEN_API_URL"),
    open_api_model=os.getenv("OPENAI_API_MODEL", "deepseek"),
    open_translate_api_model=os.getenv("OPENAI_API_MODEL", "deepseek"),
    prompt_dir=os.path.join(BASE_DIR, "Prompt"),
    search_top_k=int(os.getenv("SEARCH_TOP_K", "3")),
    local_embedding_model=os.getenv(
        "LOCAL_EMBEDDING_MODEL", "BAAI/bge-small-zh-v1.5"),
    knowledge_collection_prefix=os.getenv(
        "KNOWLEDGE_COLLECTION_PREFIX", "wenxin_knowledge_user"),
    embedding_model_path=os.path.join(BASE_DIR, "embedding_models"),
    ocr_model_path=os.path.join(BASE_DIR, "ocr_models"),
    # 日志配置
    log_level=os.getenv("LOG_LEVEL", "INFO"),
    log_dir=os.path.join(BASE_DIR, "logs"),
    log_max_bytes=int(os.getenv("LOG_MAX_BYTES", 10 * 1024 * 1024)),  # 默认10MB
    log_backup_count=int(os.getenv("LOG_BACKUP_COUNT", "5")),
    ocr_max_image_pixels=int(os.getenv("OCR_MAX_IMAGE_PIXELS", "4000000")),
    ocr_max_image_width=int(os.getenv("OCR_MAX_IMAGE_WIDTH", "2000")),
    ocr_max_image_height=int(os.getenv("OCR_MAX_IMAGE_HEIGHT", "2000")),
    ocr_pdf_render_scale=float(os.getenv("OCR_PDF_RENDER_SCALE", "1.8")),
    ocr_pdf_max_pages=int(os.getenv("OCR_PDF_MAX_PAGES", "80")),
)
