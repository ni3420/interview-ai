from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

from app.core.config import settings

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str = Security(api_key_header)) -> str:
    """Shared service-to-service authentication dependency."""
    if api_key != settings.service_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return api_key
