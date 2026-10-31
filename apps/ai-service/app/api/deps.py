import hashlib
import hmac
import secrets
import time

from fastapi import HTTPException, Request, Security
from fastapi.security import APIKeyHeader

from app.core.config import settings

SERVICE_TIMESTAMP_HEADER = "X-Service-Timestamp"
SERVICE_SIGNATURE_HEADER = "X-Service-Signature"
# A signature is accepted for five minutes around the signed timestamp. This
# bounds how long a captured request can be replayed; there is no nonce store.
SIGNATURE_TOLERANCE_SECONDS = 300

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def build_canonical_request(
    timestamp: str, method: str, path_with_query: str, body: bytes
) -> str:
    """Canonical string shared with the TypeScript signers.

    ``timestamp\\nMETHOD\\n/path?query\\nsha256_hex(body)``. Every component that
    an intermediary could alter is covered by the signature.
    """
    body_digest = hashlib.sha256(body).hexdigest()
    return f"{timestamp}\n{method.upper()}\n{path_with_query}\n{body_digest}"


def sign_service_request(
    secret: str, timestamp: str, method: str, path_with_query: str, body: bytes
) -> str:
    canonical = build_canonical_request(timestamp, method, path_with_query, body)
    return hmac.new(
        secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256
    ).hexdigest()


async def verify_api_key(
    request: Request, api_key: str | None = Security(api_key_header)
) -> None:
    """Authenticate a service-to-service request.

    Requests carrying ``X-Service-Timestamp``/``X-Service-Signature`` are
    verified with HMAC-SHA256 over the method, path, query and body. A bare
    ``X-API-Key`` is accepted only in development and test so local scripts and
    the existing test suite keep working; any other environment rejects it.

    Fails closed: an unconfigured secret rejects every request, and both the
    signature and key comparisons are constant-time.
    """
    configured = settings.service_api_key
    if not configured:
        raise HTTPException(
            status_code=500, detail="Service authentication is not configured"
        )

    timestamp = request.headers.get(SERVICE_TIMESTAMP_HEADER)
    signature = request.headers.get(SERVICE_SIGNATURE_HEADER)
    if timestamp is not None or signature is not None:
        if not timestamp or not signature:
            raise HTTPException(
                status_code=401, detail="Incomplete service signature headers"
            )
        try:
            signed_at = int(timestamp)
        except ValueError as exc:
            raise HTTPException(
                status_code=401, detail="Invalid service signature timestamp"
            ) from exc
        if abs(time.time() - signed_at) > SIGNATURE_TOLERANCE_SECONDS:
            raise HTTPException(status_code=401, detail="Expired service signature")

        path_with_query = request.url.path
        if request.url.query:
            path_with_query = f"{path_with_query}?{request.url.query}"
        expected = sign_service_request(
            configured, timestamp, request.method, path_with_query, await request.body()
        )
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(status_code=401, detail="Invalid service signature")
        return

    if settings.app_env in {"development", "test"} and api_key:
        if secrets.compare_digest(api_key, configured):
            return
    raise HTTPException(status_code=401, detail="Signed service request required")
