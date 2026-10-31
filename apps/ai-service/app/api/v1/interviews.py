from fastapi import APIRouter, Depends, HTTPException
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
from app.api.deps import verify_api_key
from app.ai.providers.factory import get_llm_provider
from app.ai.prompts.interview import INTERVIEW_PLAN_PROMPT, NEXT_QUESTION_PROMPT, EVALUATION_PROMPT
from app.ai.prompts.report import REPORT_PROMPT_VERSION
from app.core.config import settings
from app.core.metrics import timed
from app.core.rubric import RUBRIC_VERSION, RubricError
from app.schemas.report import ReportRequest, ReportResponse
from app.services.report_evaluation import ReportEvaluationError, build_report
import json
import logging

logging.basicConfig(level=logging.INFO)

router = APIRouter()


def _configured_provider() -> str:
    return settings.ai_provider.strip().lower()


def _configured_model(provider: str) -> str:
    return settings.gemini_model if provider == "gemini" else settings.ollama_model


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
        provider = _configured_provider()
        with timed(
            "llm.generate",
            conversation="plan",
            configuredProvider=provider,
            configuredModel=_configured_model(provider),
            promptChars=len(prompt),
        ):
            response = await get_llm_provider().generate(prompt)
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
        provider = _configured_provider()
        with timed(
            "llm.generate",
            conversation="next_question",
            configuredProvider=provider,
            configuredModel=_configured_model(provider),
            promptChars=len(prompt),
        ):
            response = await get_llm_provider().generate(prompt)
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
    "/report",
    response_model=ReportResponse,
    responses={
        401: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
    dependencies=[Depends(verify_api_key)],
)
async def generate_interview_report(request: ReportRequest):
    """Evidence-based report with rubric scoring.

    The AI service re-derives segment kinds, matches answers to questions by
    time window, validates evidence quotes and computes all weighted scores.
    A 502 means the model output was unusable; nothing is returned that could be
    persisted as a completed report.
    """
    try:
        provider = _configured_provider()
        with timed(
            "llm.generate",
            conversation="report",
            configuredProvider=provider,
            configuredModel=_configured_model(provider),
            promptVersion=REPORT_PROMPT_VERSION,
            rubricVersion=RUBRIC_VERSION,
            segmentCount=len(request.segments),
            questionCount=len(request.qa_pairs),
        ):
            return await build_report(request, provider=get_llm_provider())
    except RubricError as error:
        logging.error("Invalid report rubric: %s", error)
        raise HTTPException(
            status_code=500,
            detail={"code": "invalid_rubric", "message": str(error)},
        ) from error
    except ReportEvaluationError as error:
        logging.error("Report evaluation failed: %s", error)
        raise HTTPException(
            status_code=502,
            detail={"code": error.code, "message": error.message},
        ) from error
    except Exception as error:
        logging.error("Failed to generate report", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "code": "report_generation_failed",
                "message": "Failed to generate report",
            },
        ) from error


@router.post(
    "/evaluate",
    response_model=EvaluationResponse,
    responses={401: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
    dependencies=[Depends(verify_api_key)],
)
async def evaluate_interview(request: EvaluationRequest):
    qa_pairs_str = "\n\n".join(
        [f"question_index {idx}: {qa.get('question', '')}\nanswer {idx}: {qa.get('answer', '')}"
         for idx, qa in enumerate(request.qa_pairs)]
    )

    prompt = EVALUATION_PROMPT.format(
        resume_text=request.resume_text,
        job_description=request.job_description,
        qa_pairs=qa_pairs_str,
    )
    try:
        provider = _configured_provider()
        with timed(
            "llm.generate",
            conversation="evaluate",
            configuredProvider=provider,
            configuredModel=_configured_model(provider),
            promptChars=len(prompt),
        ):
            response = await get_llm_provider().generate(prompt)
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