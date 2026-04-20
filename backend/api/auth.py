from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from config.settings import config
from core.database import db_manager
from core.logger import get_logger
from core.security import create_access_token, verify_access_token
from services.users import UserRecord, UserService

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)
logger = get_logger(__name__)


def _normalize_email(value: str) -> str:
    return value.strip().lower()


def _normalize_identifier(value: str) -> str:
    normalized = value.strip()
    if "@" in normalized:
        return normalized.lower()
    return normalized

# 定义请求参数


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=2, max_length=255)
    password: str = Field(min_length=6, max_length=128)

# 定义用户响应参数


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    created_at: str

# 定义登录成功后的认证响应参数,包括认证令牌和用户信息


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# 构建用户服务,创建UserService


def _build_user_service() -> UserService:
    if db_manager.mysql_engine is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="数据库未初始化")
    return UserService(db_manager.mysql_engine)

# 将用户对象类型转换为用户响应参数


def _to_user_response(user: UserRecord) -> UserResponse:
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        created_at=user.created_at.isoformat() if hasattr(
            user.created_at, "isoformat") else str(user.created_at),
    )

# 将用户对象转为认证响应参数


def _to_auth_response(user: UserRecord) -> AuthResponse:
    access_token = create_access_token(
        payload={"sub": str(user.id), "username": user.username,
                 "email": user.email},
        secret_key=config.jwt_secret_key,
        algorithm=config.jwt_algorithm,
        expire_minutes=config.jwt_expire_minutes,
    )
    return AuthResponse(access_token=access_token, user=_to_user_response(user))

# 获取当前用户返回用户对象类型


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> UserRecord:
    if credentials is None or not credentials.credentials:
        logger.warning("认证失败：未提供认证令牌")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="未提供认证令牌")

    payload = verify_access_token(
        token=credentials.credentials,
        secret_key=config.jwt_secret_key,
        algorithm=config.jwt_algorithm,
    )
    if not payload or "sub" not in payload:
        logger.warning(f"认证失败：令牌无效或已过期 (payload={payload})")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="认证令牌无效或已过期")

    service = _build_user_service()
    user = service.get_by_id(int(payload["sub"]))
    if user is None:
        logger.warning(f"认证失败：用户不存在 (user_id={payload.get('sub')})")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")

    logger.debug(f"认证成功：user_id={user.id} username={user.username}")
    return user

# 实现注册,返回认证响应参数


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest) -> AuthResponse:
    service = _build_user_service()

    username = payload.username.strip()
    email = _normalize_email(payload.email)

    if "@" not in email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="邮箱格式不正确")

    if service.get_by_email(email) is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="邮箱已被注册")
    if service.get_by_username(username) is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="用户名已存在")

    user = service.create_user(
        username=username,
        email=email,
        password=payload.password,
    )
    logger.info(f"用户注册成功: {user}")
    return _to_auth_response(user)

# 实现登录,返回认证响应参数


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest) -> AuthResponse:
    service = _build_user_service()
    identifier = _normalize_identifier(payload.identifier)
    user = service.get_by_identifier(identifier)
    if user is None:
        logger.warning("登录失败：未找到账号 identifier=%s", identifier)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="账号或密码错误")

    if not service.verify_password(payload.password, user.password_hash):
        logger.warning("登录失败：密码不匹配 user_id=%s identifier=%s",
                       user.id, identifier)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="账号或密码错误")
    logger.info(f"用户登录成功: {user}")
    return _to_auth_response(user)

# 实现获取当前用户


@router.get("/me", response_model=UserResponse)
def me(current_user: UserRecord = Depends(get_current_user)) -> UserResponse:
    logger.info(
        f"获取当前用户信息：user_id={current_user.id} username={current_user.username}")
    return _to_user_response(current_user)
