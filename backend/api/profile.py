from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi import File, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from api.auth import get_current_user
from config.settings import config
from core.database import db_manager
from services.profile import ProfileService, ProfileUploadRecord
from services.preferences import UserPreferencesService
from services.users import UserRecord

router = APIRouter(prefix="/profile", tags=["profile"])


class UploadDetailResponse(BaseModel):
    id: int
    filename: str
    content_type: str
    file_size: int
    extracted_text: str | None = None
    has_extracted_text: bool
    created_at: str


class ProfileSummaryResponse(BaseModel):
    username: str
    email: str
    total_uploads: int
    uploads: list[UploadDetailResponse]


class ProfileUserResponse(BaseModel):
    id: int
    username: str
    email: str
    created_at: str


class UpdateExtractedTextRequest(BaseModel):
    extracted_text: str = Field(min_length=1)


class DeleteUploadResponse(BaseModel):
    deleted: bool


class UpdateProfileRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    email: str = Field(min_length=5, max_length=255)
    current_password: str | None = Field(
        default=None, min_length=0, max_length=128)
    new_password: str | None = Field(
        default=None, min_length=0, max_length=128)


class SearchSettingsResponse(BaseModel):
    api_key: str
    has_api_key: bool
    model: str
    base_url: str
    answer_prompt: str
    system_default_answer_prompt: str


class UpdateSearchSettingsRequest(BaseModel):
    api_key: str | None = None
    model: str | None = None
    base_url: str | None = None
    answer_prompt: str | None = None


class UISettingsResponse(BaseModel):
    theme_mode: str
    music_file_name: str | None = None
    music_url: str | None = None


class UpdateUISettingsRequest(BaseModel):
    theme_mode: str = Field(default="light")


class UploadMusicResponse(BaseModel):
    music_file_name: str
    music_url: str


def _build_profile_service() -> ProfileService:
    if db_manager.mysql_engine is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="数据库未初始化",
        )
    return ProfileService(
        engine=db_manager.mysql_engine,
        chroma_client=db_manager.chroma_client,
        upload_dir=config.upload_dir,
        embedding_model_name=config.local_embedding_model,
        embedding_model_path=config.embedding_model_path,
        collection_prefix=config.knowledge_collection_prefix,
    )


def _build_preferences_service() -> UserPreferencesService:
    if db_manager.mysql_engine is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="数据库未初始化",
        )
    return UserPreferencesService(
        engine=db_manager.mysql_engine,
        music_dir=os.path.join(config.upload_dir, "settings_music"),
    )


def _to_search_settings_response(user_id: int, service: UserPreferencesService) -> SearchSettingsResponse:
    settings = service.get_search_settings(user_id)
    system_default_answer_prompt = ""
    default_prompt_path = os.path.join(
        config.prompt_dir, 'search_prompt.txt')
    if os.path.exists(default_prompt_path):
        with open(default_prompt_path, "r", encoding="utf-8") as f:
            system_default_answer_prompt = f.read().strip()

    return SearchSettingsResponse(
        api_key=settings.api_key or "" if settings else "",
        has_api_key=bool(
            settings and settings.api_key and settings.api_key.strip()),
        model=(
            settings.model if settings and settings.model else config.open_api_model),
        base_url=(
            settings.base_url if settings and settings.base_url else config.open_api_url),
        answer_prompt=(
            settings.answer_prompt if settings and settings.answer_prompt else ""),
        system_default_answer_prompt=system_default_answer_prompt,
    )


def _to_ui_settings_response(user_id: int, service: UserPreferencesService) -> UISettingsResponse:
    settings = service.get_ui_settings(user_id)
    music_url = None
    if settings.music_file_name:
        music_url = f"/api/profile/ui-settings/music/{settings.music_file_name}"
    return UISettingsResponse(
        theme_mode=settings.theme_mode,
        music_file_name=settings.music_file_name,
        music_url=music_url,
    )


def _to_upload_response(record: ProfileUploadRecord, include_text: bool = False) -> UploadDetailResponse:
    return UploadDetailResponse(
        id=record.id,
        filename=record.filename,
        content_type=record.content_type,
        file_size=record.file_size,
        extracted_text=record.extracted_text if include_text else None,
        has_extracted_text=bool(
            record.extracted_text and record.extracted_text.strip()),
        created_at=(
            record.created_at.isoformat()
            if hasattr(record.created_at, "isoformat")
            else str(record.created_at)
        ),
    )


def _to_user_response(user: UserRecord) -> ProfileUserResponse:
    return ProfileUserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        created_at=(
            user.created_at.isoformat()
            if hasattr(user.created_at, "isoformat")
            else str(user.created_at)
        ),
    )


@router.get("/summary", response_model=ProfileSummaryResponse)
def get_profile_summary(
    current_user: UserRecord = Depends(get_current_user),
) -> ProfileSummaryResponse:
    service = _build_profile_service()
    records = service.list_uploads(current_user.id)

    return ProfileSummaryResponse(
        username=current_user.username,
        email=current_user.email,
        total_uploads=len(records),
        uploads=[_to_upload_response(record) for record in records],
    )


@router.get("/uploads", response_model=list[UploadDetailResponse])
def list_uploads(
    current_user: UserRecord = Depends(get_current_user),
) -> list[UploadDetailResponse]:
    service = _build_profile_service()
    records = service.list_uploads(current_user.id)
    return [_to_upload_response(record) for record in records]


@router.get("/uploads/{upload_id}", response_model=UploadDetailResponse)
def get_upload_detail(
    upload_id: int,
    current_user: UserRecord = Depends(get_current_user),
) -> UploadDetailResponse:
    service = _build_profile_service()
    record = service.get_upload(current_user.id, upload_id)
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="上传记录不存在或无权访问",
        )
    return _to_upload_response(record, include_text=True)


@router.put("/uploads/{upload_id}/extracted-text", response_model=UploadDetailResponse)
def update_upload_extracted_text(
    upload_id: int,
    payload: UpdateExtractedTextRequest,
    current_user: UserRecord = Depends(get_current_user),
) -> UploadDetailResponse:
    service = _build_profile_service()
    try:
        record = service.update_extracted_text(
            user_id=current_user.id,
            upload_id=upload_id,
            extracted_text=payload.extracted_text,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="上传记录不存在或无权访问",
        )
    return _to_upload_response(record, include_text=True)


@router.delete("/uploads/{upload_id}", response_model=DeleteUploadResponse)
def delete_upload(
    upload_id: int,
    current_user: UserRecord = Depends(get_current_user),
) -> DeleteUploadResponse:
    service = _build_profile_service()
    deleted = service.delete_upload(current_user.id, upload_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="上传记录不存在或无权访问",
        )
    return DeleteUploadResponse(deleted=True)


@router.put("/settings", response_model=ProfileUserResponse)
def update_profile_settings(
    payload: UpdateProfileRequest,
    current_user: UserRecord = Depends(get_current_user),
) -> ProfileUserResponse:
    service = _build_profile_service()
    try:
        updated_user = service.update_user_profile(
            user_id=current_user.id,
            username=payload.username,
            email=payload.email,
            current_password=payload.current_password,
            new_password=payload.new_password if payload.new_password else None,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    if updated_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在",
        )

    return _to_user_response(updated_user)


@router.get("/search-settings", response_model=SearchSettingsResponse)
def get_search_settings(
    current_user: UserRecord = Depends(get_current_user),
) -> SearchSettingsResponse:
    service = _build_preferences_service()
    return _to_search_settings_response(current_user.id, service)


@router.put("/search-settings", response_model=SearchSettingsResponse)
def update_search_settings(
    payload: UpdateSearchSettingsRequest,
    current_user: UserRecord = Depends(get_current_user),
) -> SearchSettingsResponse:
    service = _build_preferences_service()
    service.upsert_search_settings(
        user_id=current_user.id,
        api_key=payload.api_key,
        model=payload.model,
        base_url=payload.base_url,
        answer_prompt=payload.answer_prompt,
    )
    return _to_search_settings_response(current_user.id, service)


@router.get("/ui-settings", response_model=UISettingsResponse)
def get_ui_settings(
    current_user: UserRecord = Depends(get_current_user),
) -> UISettingsResponse:
    service = _build_preferences_service()
    return _to_ui_settings_response(current_user.id, service)


@router.put("/ui-settings", response_model=UISettingsResponse)
def update_ui_settings(
    payload: UpdateUISettingsRequest,
    current_user: UserRecord = Depends(get_current_user),
) -> UISettingsResponse:
    service = _build_preferences_service()
    existing = service.get_ui_settings(current_user.id)
    service.upsert_ui_settings(
        user_id=current_user.id,
        theme_mode=payload.theme_mode,
        music_file_name=existing.music_file_name,
    )
    return _to_ui_settings_response(current_user.id, service)


@router.post("/ui-settings/music", response_model=UploadMusicResponse)
async def upload_ui_music(
    file: UploadFile = File(...),
    current_user: UserRecord = Depends(get_current_user),
) -> UploadMusicResponse:
    allowed = {"audio/mpeg", "audio/mp3", "audio/wav",
               "audio/ogg", "audio/x-m4a", "audio/aac", "audio/flac"}
    if (file.content_type or "").lower() not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="仅支持 mp3/wav/ogg/m4a/aac/flac 音频文件",
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="音频文件不能为空",
        )

    service = _build_preferences_service()
    stored_name = service.save_music_file(
        user_id=current_user.id,
        filename=file.filename or "background.mp3",
        data=content,
    )
    existing = service.get_ui_settings(current_user.id)
    service.upsert_ui_settings(
        user_id=current_user.id,
        theme_mode=existing.theme_mode,
        music_file_name=stored_name,
    )
    return UploadMusicResponse(
        music_file_name=stored_name,
        music_url=f"/api/profile/ui-settings/music/{stored_name}",
    )


@router.get("/ui-settings/music/{stored_name}")
def get_ui_music_file(
    stored_name: str,
    current_user: UserRecord = Depends(get_current_user),
) -> FileResponse:
    service = _build_preferences_service()
    file_path = service.get_music_file_path(current_user.id, stored_name)
    if file_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="音频文件不存在",
        )
    return FileResponse(path=file_path)
