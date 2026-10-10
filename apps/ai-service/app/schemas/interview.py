from pydantic import BaseModel, Field
from typing import Optional


class InterviewPlanRequest(BaseModel):
    resume_text: str = Field(..., min_length=100, description="Extracted text from resume")
    job_description: str = Field(..., min_length=50, description="Job description text")


class InterviewPlanResponse(BaseModel):
    questions: list[str] = Field(..., min_length=1, max_length=10)
    focus_areas: list[str] = Field(default_factory=list)


class NextQuestionRequest(BaseModel):
    resume_text: str
    job_description: str
    current_question: str
    user_answer: str
    question_index: int = Field(..., ge=0)
    previous_qa: list[dict[str, str]] = Field(default_factory=list)


class NextQuestionResponse(BaseModel):
    question: str
    is_follow_up: bool
    follow_up_count: int = Field(..., ge=0, le=3)


class ErrorResponse(BaseModel):
    error: dict[str, str]