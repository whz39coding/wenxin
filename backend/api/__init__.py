from .auth import router as auth_router
from .exhibition import router as exhibition_router
from .ocr import router as ocr_router
from .portal import router as portal_router
from .profile import router as profile_router
from .restore import router as restore_router
from .search import router as search_router
from .uploads import router as uploads_router

__all__ = [
    "auth_router",
    "exhibition_router",
    "uploads_router",
    "portal_router",
    "profile_router",
    "ocr_router",
    "restore_router",
    "search_router",
]
