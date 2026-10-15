from pydantic import BaseModel, Field, HttpUrl


class ResumeProcessRequest(BaseModel):
    resume_id: str = Field(..., min_length=1, max_length=128)
    user_id: str = Field(..., min_length=1, max_length=128)
    file_url: HttpUrl = Field(..., description="Short-lived URL to the uploaded PDF")


class ResumeProcessResponse(BaseModel):
    resume_id: str
    text: str
    chunk_count: int = Field(..., ge=0)
    embedding_model: str
    embedding_dimension: int = Field(..., ge=1)


class ResumeRetrieveRequest(BaseModel):
    resume_id: str = Field(..., min_length=1, max_length=128)
    user_id: str = Field(..., min_length=1, max_length=128)
    query: str = Field(..., min_length=1, max_length=2000)
    limit: int = Field(default=5, ge=1, le=20)


class ResumeChunk(BaseModel):
    text: str
    chunk_index: int = Field(..., ge=0)
    score: float


class ResumeRetrieveResponse(BaseModel):
    chunks: list[ResumeChunk]
