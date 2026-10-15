from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import APIKeyHeader
from app.schemas.interview import (
    InterviewPlanRequest,
    InterviewPlanResponse,
    NextQuestionRequest,
    NextQuestionResponse,
    EvaluationRequest,
    EvaluationResponse,
    QuestionScore,
    ErrorResponse,
)
from app.ai.providers.gemini import gemini_provider
from app.ai.prompts.interview import INTERVIEW_PLAN_PROMPT, NEXT_QUESTION_PROMPT, EVALUATION_PROMPT
from app.core.config import settings
import json
import logging

logging.basicConfig(level=logging.INFO)

router = APIRouter()

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str = Security(api_key_header)):
    if api_key != settings.service_api_key:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return api_key


def parse_json_response(response: str) -> dict:
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        start = response.find("{")
        end = response.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(response[start:end])
        raise ValueError("Invalid JSON response from AI")


@router.post(
    "/plan",
    response_model=InterviewPlanResponse,
    responses={401: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    dependencies=[Depends(verify_api_key)],
)
async def generate_interview_plan(request: InterviewPlanRequest):
    prompt = INTERVIEW_PLAN_PROMPT.format(
        resume_text=request.resume_text,
        job_description=request.job_description,
    )
    try:
        response = await gemini_provider.generate(prompt)
        data = parse_json_response(response)
        return InterviewPlanResponse(
            questions=data.get("questions", []),
            focus_areas=data.get("focus_areas", []),
        )
    except Exception as e:
        logging.error("Failed to generate plan", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate plan")
        


@router.post(
    "/next-question",
    response_model=NextQuestionResponse,
    responses={401: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    dependencies=[Depends(verify_api_key)],
)
async def generate_next_question(request: NextQuestionRequest):
    previous_qa_str = "\n".join(
        [f"Q: {qa.get('question', '')}\nA: {qa.get('answer', '')}" for qa in request.previous_qa]
    ) or "None"

    prompt = NEXT_QUESTION_PROMPT.format(
        resume_text=request.resume_text,
        job_description=request.job_description,
        current_question=request.current_question,
        user_answer=request.user_answer,
        question_index=request.question_index,
        previous_qa=previous_qa_str,
    )
    try:
        response = await gemini_provider.generate(prompt)
        data = parse_json_response(response)
        return NextQuestionResponse(
            question=data.get("question", ""),
            is_follow_up=data.get("is_follow_up", False),
            follow_up_count=data.get("follow_up_count", 0),
        )
    except Exception as e:
        logging.error("Failed to generate question", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate question")


@router.post(
    "/evaluate",
    response_model=EvaluationResponse,
    responses={401: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    dependencies=[Depends(verify_api_key)],
)
async def evaluate_interview(request: EvaluationRequest):
    qa_pairs_str = "\n\n".join(
        [f"Q{idx + 1}: {qa.get('question', '')}\nA{idx + 1}: {qa.get('answer', '')}"
         for idx, qa in enumerate(request.qa_pairs)]
    )

    prompt = EVALUATION_PROMPT.format(
        resume_text=request.resume_text,
        job_description=request.job_description,
        qa_pairs=qa_pairs_str,
    )
    try:
        response = await gemini_provider.generate(prompt)
        data = parse_json_response(response)
        return EvaluationResponse(
            overall_score=data.get("overall_score", 0),
            strengths=data.get("strengths", []),
            weaknesses=data.get("weaknesses", []),
            recommendations=data.get("recommendations", []),
            question_scores=[
                QuestionScore(**qs) for qs in data.get("question_scores", [])
            ],
        )
    except Exception as e:
        logging.error("Failed to evaluate interview", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to evaluate interview")