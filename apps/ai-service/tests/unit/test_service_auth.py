import json
import time

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from app.api.deps import sign_service_request
from app.core.config import Settings, settings
from app.main import app

PLAN_URL = "/v1/interviews/plan"
# Short payloads: authentication runs first, then request validation returns
# 422. A 422 therefore proves the request was authenticated.
INVALID_BODY = {"resume_text": "short", "job_description": "short"}


def signed_request(
    body: dict,
    *,
    secret: str | None = None,
    timestamp: int | None = None,
    path: str = PLAN_URL,
) -> tuple[bytes, dict[str, str]]:
    """Serialize once so the signed bytes are exactly what is sent."""
    payload = json.dumps(body, separators=(",", ":")).encode("utf-8")
    signed_at = str(timestamp if timestamp is not None else int(time.time()))
    signature = sign_service_request(
        secret or settings.service_api_key, signed_at, "POST", path, payload
    )
    return payload, {
        "Content-Type": "application/json",
        "X-Service-Timestamp": signed_at,
        "X-Service-Signature": signature,
    }


class TestServiceKeyConfiguration:
    def test_missing_key_is_rejected(self):
        with pytest.raises(ValidationError):
            Settings(_env_file=None, service_api_key="", app_env="development")

    def test_development_default_is_rejected_outside_development(self):
        with pytest.raises(ValidationError):
            Settings(
                _env_file=None,
                service_api_key="dev-secret-key",
                app_env="production",
            )

    def test_development_default_is_allowed_in_development(self):
        loaded = Settings(
            _env_file=None,
            service_api_key="dev-secret-key",
            app_env="development",
        )
        assert loaded.service_api_key == "dev-secret-key"


class TestServiceAuthentication:
    @pytest.mark.asyncio
    async def test_missing_key_is_unauthorized(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(PLAN_URL, json=INVALID_BODY)
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_empty_key_is_unauthorized(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                PLAN_URL,
                headers={"X-API-Key": "", "Content-Type": "application/json"},
                json=INVALID_BODY,
            )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_wrong_key_is_unauthorized(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                PLAN_URL,
                headers={
                    "X-API-Key": "definitely-not-the-service-key",
                    "Content-Type": "application/json",
                },
                json=INVALID_BODY,
            )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_configured_key_passes_authentication(self):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                PLAN_URL,
                headers={
                    "X-API-Key": settings.service_api_key,
                    "Content-Type": "application/json",
                },
                json=INVALID_BODY,
            )
        assert response.status_code == 422


class TestSignedServiceRequests:
    @pytest.mark.asyncio
    async def test_valid_signature_passes_authentication(self):
        payload, headers = signed_request(INVALID_BODY)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(PLAN_URL, content=payload, headers=headers)
        assert response.status_code == 422

    def test_cross_language_vector(self):
        """Must match the fixed vector in `worker/test/signing.test.ts`."""
        payload = b'{"resume_text":"a","job_description":"b"}'
        assert (
            sign_service_request(
                "test-service-secret-0123456789abcdef",
                "1767225600",
                "POST",
                "/v1/interviews/plan",
                payload,
            )
            == "9c79e51b1fc834cea825a15f88a017bf7ef4906951262743b92d25ea8fee790b"
        )

    @pytest.mark.asyncio
    async def test_tampered_body_is_unauthorized(self):
        _, headers = signed_request(INVALID_BODY)
        tampered = json.dumps(
            {"resume_text": "other", "job_description": "short"},
            separators=(",", ":"),
        ).encode("utf-8")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(PLAN_URL, content=tampered, headers=headers)
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_bad_signature_is_unauthorized(self):
        payload, headers = signed_request(INVALID_BODY)
        headers["X-Service-Signature"] = "0" * 64
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(PLAN_URL, content=payload, headers=headers)
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_expired_signature_is_unauthorized(self):
        payload, headers = signed_request(
            INVALID_BODY, timestamp=int(time.time()) - 3600
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(PLAN_URL, content=payload, headers=headers)
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_production_rejects_key_only(self, monkeypatch):
        monkeypatch.setattr(settings, "app_env", "production")
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                PLAN_URL,
                headers={
                    "X-API-Key": settings.service_api_key,
                    "Content-Type": "application/json",
                },
                json=INVALID_BODY,
            )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_production_accepts_signed_request(self, monkeypatch):
        monkeypatch.setattr(settings, "app_env", "production")
        payload, headers = signed_request(INVALID_BODY)
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(PLAN_URL, content=payload, headers=headers)
        assert response.status_code == 422
