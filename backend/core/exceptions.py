from __future__ import annotations

from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from core.logger import get_logger


logger = get_logger(__name__)


class AppError(Exception):
    def __init__(self, message: str, code: str = "APP_ERROR", status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


def _request_context(request: Request) -> dict:
    client = request.client
    return {
        "method": request.method,
        "path": request.url.path,
        "query": str(request.url.query or ""),
        "client": f"{client.host}:{client.port}" if client else "unknown",
        "user_agent": request.headers.get("user-agent", ""),
    }


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        '''专门处理应用程序自定义的 AppError 类型异常
        如raise AppError(message="用户不存在", code="USER_NOT_FOUND", status_code=404)'''
        error_id = uuid4().hex[:12]
        logger.warning(
            "AppError 捕捉: error_id=%s code=%s status=%s message=%s context=%s",
            error_id,
            exc.code,
            exc.status_code,
            exc.message,
            _request_context(request),
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "code": exc.code,
                "message": exc.message,
                "error_id": error_id,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        ''' 专门处理请求参数验证异常,自动抛出'''
        error_id = uuid4().hex[:12]
        logger.warning(
            "请求参数验证异常: error_id=%s errors=%s context=%s",
            error_id,
            exc.errors(),
            _request_context(request),
        )
        return JSONResponse(
            status_code=422,
            content={
                "code": "VALIDATION_ERROR",
                "message": "请求参数验证失败",
                "error_id": error_id,
                "errors": exc.errors(),
            },
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        ''' 专门处理未处理的异常,其余的异常,自动抛出'''
        error_id = uuid4().hex[:12]
        logger.exception(
            "未处理异常: error_id=%s context=%s",
            error_id,
            _request_context(request),
        )
        return JSONResponse(
            status_code=500,
            content={
                "code": "INTERNAL_ERROR",
                "message": "服务器内部错误，请联系管理员并提供 error_id",
                "error_id": error_id,
            },
        )
