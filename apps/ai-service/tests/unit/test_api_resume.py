import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, patch

from app.main import app
from app.services.resume_extraction import ResumeExtractionError

HEADERS = {"X-API-Key": "dev-secret-key", "Content-Type": "application/json"}
PDF_URL = "http://localhost/files/resume.pdf"
VALID_BODY = {"resume_id": "resume-1", "user_id": "user-1", "file_url": PDF_URL}


async def _post(path: str, body: dict, headers: dict = HEADERS):
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        return await client.post(path, headers=headers, json=body)


class TestProcessResume:
    @pytest.mark.asyncio
    async def test_unauthorized(self):
        response = await _post(
            "/v1/resumes/process", VALID_BODY, headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_file_url(self):
        response = await _post(
            "/v1/resumes/process", {**VALID_BODY, "file_url": "not-a-url"}
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_process_success(self):
        with (
            patch(
                "app.api.v1.resumes.download_pdf", new_callable=AsyncMock
            ) as mock_download,
            patch(
                "app.api.v1.resumes.extract_text_from_pdf",
                return_value="resume text",
            ),
            patch(
                "app.api.v1.resumes.vector_store.index_resume", return_value=3
            ) as mock_index,
        ):
            mock_download.return_value = b"%PDF-1.4 fake"
            response = await _post("/v1/resumes/process", VALID_BODY)

        assert response.status_code == 200
        data = response.json()
        assert data["chunk_count"] == 3
        assert data["resume_id"] == "resume-1"
        assert data["embedding_model"]
        assert data["embedding_dimension"] > 0
        mock_index.assert_called_once()

    @pytest.mark.asyncio
    async def test_process_extraction_failure_is_422(self):
        with (
            patch(
                "app.api.v1.resumes.download_pdf", new_callable=AsyncMock
            ) as mock_download,
            patch(
                "app.api.v1.resumes.extract_text_from_pdf",
                side_effect=ResumeExtractionError("no text"),
            ),
        ):
            mock_download.return_value = b"x"
            response = await _post("/v1/resumes/process", VALID_BODY)

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_process_index_failure_is_500(self):
        with (
            patch(
                "app.api.v1.resumes.download_pdf", new_callable=AsyncMock
            ) as mock_download,
            patch(
                "app.api.v1.resumes.extract_text_from_pdf", return_value="resume text"
            ),
            patch(
                "app.api.v1.resumes.vector_store.index_resume",
                side_effect=RuntimeError("qdrant down"),
            ),
        ):
            mock_download.return_value = b"%PDF-1.4 fake"
            response = await _post("/v1/resumes/process", VALID_BODY)

        assert response.status_code == 500
        assert "qdrant down" not in response.text


class TestRetrieveResume:
    @pytest.mark.asyncio
    async def test_unauthorized(self):
        response = await _post(
            "/v1/resumes/retrieve",
            {"resume_id": "resume-1", "user_id": "user-1", "query": "react"},
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_retrieve_success(self):
        with patch(
            "app.api.v1.resumes.vector_store.search_resume",
            return_value=[("chunk a", 0, 0.9), ("chunk b", 1, 0.8)],
        ):
            response = await _post(
                "/v1/resumes/retrieve",
                {"resume_id": "resume-1", "user_id": "user-1", "query": "react"},
            )

        assert response.status_code == 200
        chunks = response.json()["chunks"]
        assert len(chunks) == 2
        assert chunks[0]["text"] == "chunk a"
