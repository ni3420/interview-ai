from pydantic import BaseModel, Field
from typing import Optional


class InterviewPlanRequest(BaseModel):
    resume_text: str = Field(..., min_length=100, description="Extracted text from resume")
    job_description: str = Field(..., min_length=50, description="Job description text")
    # Optional so older producers keep working; when present it attributes the
    # model-usage event to an interview for cost accounting.
    interview_id: str | None = Field(default=None, description="Convex interview id")


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


class QuestionScore(BaseModel):
    question_index: int = Field(..., ge=0)
    score: int = Field(..., ge=0, le=100)
    feedback: str


class EvaluationRequest(BaseModel):
    resume_text: str
    job_description: str
    qa_pairs: list[dict[str, str]] = Field(..., min_length=1)


class EvaluationResponse(BaseModel):
    overall_score: int = Field(..., ge=0, le=100)
    strengths: list[str] = Field(..., min_length=1, max_length=10)
    weaknesses: list[str] = Field(..., min_length=1, max_length=10)
    recommendations: list[str] = Field(..., min_length=1, max_length=10)
    question_scores: list[QuestionScore]


class ErrorResponse(BaseModel):
    error: dict[str, str]