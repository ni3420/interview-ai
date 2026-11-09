import json
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.ai.prompts.interview import EVALUATION_PROMPT, INTERVIEW_PLAN_PROMPT, NEXT_QUESTION_PROMPT
from app.ai.prompts.report import REPORT_PROMPT_VERSION
from app.ai.providers.base import ProviderResponseError
from app.ai.providers.factory import get_llm_provider, provider_log_fields
from app.api.deps import verify_api_key
from app.core.metrics import timed, usage_context
from app.core.rubric import RUBRIC_VERSION, RubricError
from app.schemas.interview import (
    ErrorResponse,
    EvaluationRequest,
    EvaluationResponse,
    InterviewPlanRequest,
    InterviewPlanResponse,
    NextQuestionRequest,
    NextQuestionResponse,
    QuestionScore,
)
from app.schemas.report import ReportRequest, ReportResponse
from app.services.report_evaluation import ReportEvaluationError, build_report

logging.basicConfig(level=logging.INFO)

router = APIRouter()


def parse_json_response(response: str) -> dict:
    try:
        return json.loads(response)
    except json.JSONDecodeError:
        start = response.find("{")
        end = response.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(response[start:end])
        raise ValueError("Invalid JSON response from AI")


# The live interviewer reads each plan entry as one turn, so an entry that asks
# more than one thing is spoken as a combined question.
MAX_PLAN_QUESTION_WORDS = 25


def compound_plan_questions(questions: list[str]) -> list[str]:
    """Return plan entries that ask more than one thing."""
    return [
        question
        for question in questions
        if question.count("?") > 1
        or len(question.split()) > MAX_PLAN_QUESTION_WORDS
    ]


@router.post(
    "/plan",
    response_model=InterviewPlanResponse,
    responses={
        401: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
    dependencies=[Depends(verify_api_key)],
)
async def generate_interview_plan(request: InterviewPlanRequest):
    prompt = INTERVIEW_PLAN_PROMPT.format(
        resume_text=request.resume_text,
        job_description=request.job_description,
    )
    try:
        with (
            usage_context("plan", interview_id=request.interview_id),
            timed(
                "llm.generate",
                conversation="plan",
                **provider_log_fields(),
                promptChars=len(prompt),
            ),
        ):
            response = await get_llm_provider().generate(prompt)
        data = parse_json_response(response)
        violations = compound_plan_questions(
            [q for q in data.get("questions", []) if isinstance(q, str)]
        )
        if violations:
            logging.warning(
                "Plan contained compound questions; regenerating once",
                extra={"questionCount": len(violations)},
            )
            corrective_prompt = (
                prompt
                + "\n\nYour previous answer broke the one-ask rule for these "
                "entries:\n"
                + "\n".join(f"- {question}" for question in violations)
                + "\nReturn the full corrected JSON with every entry as ONE "
                "atomic question of at most 20 words."
            )
            with (
                usage_context("plan", interview_id=request.interview_id),
                timed(
                    "llm.generate",
                    conversation="plan_retry",
                    **provider_log_fields(),
                    promptChars=len(corrective_prompt),
                ),
            ):
                response = await get_llm_provider().generate(corrective_prompt)
            data = parse_json_response(response)
        return InterviewPlanResponse(
            questions=data.get("questions", []),
            focus_areas=data.get("focus_areas", []),
        )
    except ProviderResponseError as error:
        logging.warning("Model returned no usable text: %s", error)
        raise HTTPException(
            status_code=502,
            detail={"code": error.code, "message": str(error)},
        ) from error
    except Exception as e:
        logging.error("Failed to generate plan", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate plan")


@router.post(
    "/next-question",
    response_model=NextQuestionResponse,
    responses={
        401: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
    dependencies=[Depends(verify_api_key)],
)
async def generate_next_question(request: NextQuestionRequest):
    previous_qa_str = (
        "\n".join(
            [
                f"Q: {qa.get('question', '')}\nA: {qa.get('answer', '')}"
                for qa in request.previous_qa
            ]
        )
        or "None"
    )

    prompt = NEXT_QUESTION_PROMPT.format(
        resume_text=request.resume_text,
        job_description=request.job_description,
        current_question=request.current_question,
        user_answer=request.user_answer,
        question_index=request.question_index,
        previous_qa=previous_qa_str,
    )
    try:
        with (
            usage_context("next_question"),
            timed(
                "llm.generate",
                conversation="next_question",
                **provider_log_fields(),
                promptChars=len(prompt),
            ),
        ):
            response = await get_llm_provider().generate(prompt)
        data = parse_json_response(response)
        return NextQuestionResponse(
            question=data.get("question", ""),
            is_follow_up=data.get("is_follow_up", False),
            follow_up_count=data.get("follow_up_count", 0),
        )
    except ProviderResponseError as error:
        logging.warning("Model returned no usable text: %s", error)
        raise HTTPException(
            status_code=502,
            detail={"code": error.code, "message": str(error)},
        ) from error
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
        with (
            usage_context("report", interview_id=request.interview_id),
            timed(
                "llm.generate",
                conversation="report",
                **provider_log_fields(),
                promptVersion=REPORT_PROMPT_VERSION,
                rubricVersion=RUBRIC_VERSION,
                segmentCount=len(request.segments),
                questionCount=len(request.qa_pairs),
            ),
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
    responses={
        401: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
    },
    dependencies=[Depends(verify_api_key)],
)
async def evaluate_interview(request: EvaluationRequest):
    qa_pairs_str = "\n\n".join(
        [
            f"question_index {idx}: {qa.get('question', '')}\nanswer {idx}: {qa.get('answer', '')}"
            for idx, qa in enumerate(request.qa_pairs)
        ]
    )

    prompt = EVALUATION_PROMPT.format(
        resume_text=request.resume_text,
        job_description=request.job_description,
        qa_pairs=qa_pairs_str,
    )
    try:
        with (
            usage_context("evaluate"),
            timed(
                "llm.generate",
                conversation="evaluate",
                **provider_log_fields(),
                promptChars=len(prompt),
            ),
        ):
            response = await get_llm_provider().generate(prompt)
        data = parse_json_response(response)
        return EvaluationResponse(
            overall_score=data.get("overall_score", 0),
            strengths=data.get("strengths", []),
            weaknesses=data.get("weaknesses", []),
            recommendations=data.get("recommendations", []),
            question_scores=[QuestionScore(**qs) for qs in data.get("question_scores", [])],
        )
    except ProviderResponseError as error:
        logging.warning("Model returned no usable text: %s", error)
        raise HTTPException(
            status_code=502,
            detail={"code": error.code, "message": str(error)},
        ) from error
    except Exception as e:
        logging.error("Failed to evaluate interview", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to evaluate interview")
