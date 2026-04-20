from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette import status
from core.database import db_manager
from core.exceptions import register_exception_handlers, AppError
from core.logger import setup_logging, get_logger
from api import auth_router, exhibition_router, ocr_router, portal_router, profile_router, restore_router, search_router, uploads_router
from core.security import verify_access_token
from services.users import UserService
from services.upload_book import UploadService
from services.preferences import UserPreferencesService
import os
import pysqlite3
import sys
from config.settings import config
sys.modules["sqlite3"] = pysqlite3
# 在任何模型加载之前，强制设置 HuggingFace 离线模式
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

# 初始化日志系统
setup_logging(
    app_name=config.app_name,
    log_level=config.log_level,
    log_dir=config.log_dir,
    max_bytes=config.log_max_bytes,
    backup_count=config.log_backup_count,
)
logger = get_logger(__name__)

AUTH_WHITELIST = {
    "/api/auth",
    "/api/auth/login",
    "/api/auth/register",
    '/api/health'
}


def _normalize_path(path: str) -> str:
    if path != "/" and path.endswith("/"):
        return path.rstrip("/")
    return path


def _extract_bearer_token(auth_header: str) -> str | None:
    if not auth_header:
        return None
    parts = auth_header.strip().split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


def _cors_json_response(request: Request, status_code: int, content: dict) -> JSONResponse:
    response = JSONResponse(status_code=status_code, content=content)
    origin = request.headers.get("origin")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Vary"] = "Origin"
    return response


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    '''
    FastAPI 的生命周期函数。服务器启动时执行前半部分,关闭时执行后半部分
    '''
    logger.info("Initializing backend resources...")
    db_manager.initialize(
        mysql_url=config.mysql_url,
        chroma_persist_dir=config.chroma_persist_dir,
    )
    # 检查数据库连接状态
    if not db_manager.mysql_ready:
        error_msg = "MySQL数据库连接失败，应用无法启动"
        logger.critical(error_msg)
        raise AppError(message=error_msg,
                       code="DB_CONNECTION_FAILED", status_code=500)

    if not db_manager.chroma_ready:
        error_msg = "Chroma向量数据库连接失败，应用无法启动"
        logger.critical(error_msg)
        raise AppError(message=error_msg,
                       code="CHROMA_CONNECTION_FAILED", status_code=500)

    if db_manager.mysql_engine is None:
        error_msg = "MySQL引擎未初始化"
        logger.critical(error_msg)
        raise AppError(message=error_msg,
                       code="DB_ENGINE_UNAVAILABLE", status_code=500)

    UserService(db_manager.mysql_engine).ensure_user_table()  # 确保用户表存在
    UploadService(db_manager.mysql_engine,
                  config.upload_dir).ensure_upload_table()  # 确保上传记录表存在
    UserPreferencesService(db_manager.mysql_engine).ensure_tables()

    logger.info("数据库连接正常")
    yield
    logger.info("Releasing backend resources...")
    db_manager.close()


app = FastAPI(
    title=config.app_name,
    version=config.app_version,
    description="WenXinClassics backend service (Phase 1 scaffold)",
    lifespan=lifespan,
)

# 允许前端开发服务器进行跨域请求（含 OPTIONS 预检）
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://47.104.224.19:9000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    max_age=3600,
)


@app.middleware("http")
async def auth_guard_middleware(request: Request, call_next):
    normalized_path = _normalize_path(request.url.path)

    if request.method == "OPTIONS":
        return await call_next(request)

    if not normalized_path.startswith("/api"):
        return await call_next(request)

    if normalized_path in AUTH_WHITELIST:
        return await call_next(request)

    token = _extract_bearer_token(request.headers.get("Authorization", ""))
    if token is None:
        return _cors_json_response(
            request,
            status.HTTP_401_UNAUTHORIZED,
            {"detail": "未登录或认证令牌格式错误"},
        )

    payload = verify_access_token(
        token=token,
        secret_key=config.jwt_secret_key,
        algorithm=config.jwt_algorithm,
    )
    if not payload or "sub" not in payload:
        return _cors_json_response(
            request,
            status.HTTP_401_UNAUTHORIZED,
            {"detail": "认证令牌无效或已过期"},
        )

    if db_manager.mysql_engine is None:
        return _cors_json_response(
            request,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            {"detail": "数据库未初始化"},
        )

    user = UserService(db_manager.mysql_engine).get_by_id(int(payload["sub"]))
    if user is None:
        return _cors_json_response(
            request,
            status.HTTP_401_UNAUTHORIZED,
            {"detail": "用户不存在"},
        )

    request.state.current_user = user
    return await call_next(request)

# 注册去全局异常处理
register_exception_handlers(app)
# 添加注册登录的路由
app.include_router(auth_router, prefix="/api")
# 添加上传文件的路由
app.include_router(uploads_router, prefix="/api")
# 添加 OCR 路由
app.include_router(ocr_router, prefix="/api")
# 添加门户总览路由
app.include_router(portal_router, prefix="/api")
# 添加个人资料路由
app.include_router(profile_router, prefix="/api")
# 添加竹简展厅路由
app.include_router(exhibition_router, prefix="/api")
# 添加寻章问义路由
app.include_router(search_router, prefix="/api")
# 添加残篇补阙路由
app.include_router(restore_router, prefix="/api")


@app.get("/api/health", tags=["system"])
async def health_check() -> dict:
    return {
        "status": "ok",
        "env": config.app_env,
        "mysql_ready": db_manager.mysql_ready,
        "chroma_ready": db_manager.chroma_ready,
    }
