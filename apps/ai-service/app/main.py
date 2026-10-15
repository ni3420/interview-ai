from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import interviews, resumes
from app.core.config import settings

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs" if settings.app_env == "development" else None,
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


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": settings.app_name}