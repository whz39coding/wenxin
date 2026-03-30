from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

try:
    import jwt
except ImportError:  # pragma: no cover - dependency may be installed later
    jwt = None


def create_access_token(
    payload: Dict[str, Any],
    secret_key: str,
    algorithm: str,
    expire_minutes: int,
) -> str:
    if jwt is None:
        raise RuntimeError("PyJWT is not installed.")

    to_encode = payload.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, secret_key, algorithm=algorithm)


def verify_access_token(token: str, secret_key: str, algorithm: str) -> Optional[Dict[str, Any]]:
    if jwt is None:
        return None

    try:
        return jwt.decode(token, secret_key, algorithms=[algorithm])
    except Exception:  # noqa: BLE001
        return None
