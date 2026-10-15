import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import verify_api_key
from app.core.config import settings
from app.repositories import vector_store
from app.schemas.resume import (
    ResumeChunk,
    ResumeProcessRequest,
    ResumeProcessResponse,
    ResumeRetrieveRequest,
    ResumeRetrieveResponse,
)
from app.services.chunking import chunk_text
from app.services.resume_extraction import ResumeExtractionError, extract_text_from_pdf

router = APIRouter()


async def download_pdf(url: str) -> bytes:
    """Download a resume PDF with a hard size cap and bounded timeout."""
    max_bytes = settings.resume_max_bytes
    total = 0
    buffer = bytearray()

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        async with client.stream("GET", url) as response:
            response.raise_for_status()
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail="Resume exceeds the maximum allowed size",
                    )
                buffer.extend(chunk)

    return bytes(buffer)


@router.post(
    "/process",
    response_model=ResumeProcessResponse,
    dependencies=[Depends(verify_api_key)],
)
async def process_resume(request: ResumeProcessRequest) -> ResumeProcessResponse:
    """Extract, chunk, embed and index a resume into Qdrant."""
    try:
        data = await download_pdf(str(request.file_url))
        text = extract_text_from_pdf(data)
        chunks = chunk_text(text)
        if not chunks:
            raise HTTPException(
                status_code=422, detail="Resume did not contain usable text"
            )
        chunk_count = vector_store.index_resume(
            request.user_id, request.resume_id, chunks
        )
    except ResumeExtractionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except vector_store.VectorStoreConfigError as exc:
        logging.error("Vector store configuration error", exc_info=True)
        raise HTTPException(
            status_code=500, detail="Vector store is misconfigured"
        ) from exc
    except HTTPException:
        raise
    except Exception:
        logging.error("Failed to process resume", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to process resume")

    return ResumeProcessResponse(
        resume_id=request.resume_id,
        text=text,
        chunk_count=chunk_count,
        embedding_model=settings.embedding_model,
        embedding_dimension=settings.embedding_dimension,
    )


@router.post(
    "/retrieve",
    response_model=ResumeRetrieveResponse,
    dependencies=[Depends(verify_api_key)],
)
async def retrieve_resume_context(
    request: ResumeRetrieveRequest,
) -> ResumeRetrieveResponse:
    """Semantic retrieval filtered to the authorized user and resume."""
    try:
        results = vector_store.search_resume(
            request.user_id, request.resume_id, request.query, request.limit
        )
    except vector_store.VectorStoreConfigError as exc:
        logging.error("Vector store configuration error", exc_info=True)
        raise HTTPException(
            status_code=500, detail="Vector store is misconfigured"
        ) from exc
    except Exception:
        logging.error("Failed to retrieve resume context", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve context")

    return ResumeRetrieveResponse(
        chunks=[
            ResumeChunk(text=text, chunk_index=index, score=score)
            for text, index, score in results
        ]
    )
