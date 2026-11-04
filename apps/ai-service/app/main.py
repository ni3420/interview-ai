import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.ai.providers.factory import validate_provider_config
from app.api.v1 import interviews, realtime, resumes
from app.core.config import settings
from app.realtime.runner import (
    RealtimeRuntimeUnavailableError,
    ensure_available,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Import the realtime stack before accepting interview traffic.

    The vision-agents import takes ~13s cold (measured in the service image on
    2026-11-01). Running it inside the first ``/v1/realtime/join-call`` request
    blocked the event loop long enough that the Next.js dispatcher hit its 15s
    timeout and reported a failed dispatch while the agent actually joined.
    """
    validate_provider_config()
    try:
        await asyncio.to_thread(ensure_available)
    except RealtimeRuntimeUnavailableError as exc:
        logger.info("Realtime interviewer unavailable at startup: %s", exc)
    else:
        logger.info("Realtime interviewer runtime ready")
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs" if settings.app_env == "development" else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(interviews.router, prefix="/v1/interviews", tags=["interviews"])
app.include_router(resumes.router, prefix="/v1/resumes", tags=["resumes"])
app.include_router(realtime.router, prefix="/v1/realtime", tags=["realtime"])


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": settings.app_name}
