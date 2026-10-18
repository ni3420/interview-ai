from pydantic import BaseModel, Field


class RealtimeJoinRequest(BaseModel):
    """Server-to-server request to place the AI interviewer in a call.

    Only trusted server code (the Next.js Stream route) reaches this endpoint:
    it is authenticated with the service API key and the candidate's resume and
    job description are read from Convex, never supplied by the browser.
    """

    call_id: str = Field(..., min_length=1, max_length=200)
    call_type: str = Field(default="default", min_length=1, max_length=64)
    interview_id: str | None = Field(default=None, max_length=128)
    resume_text: str = Field(default="", max_length=20_000)
    job_description: str = Field(default="", max_length=8_000)
    questions: list[str] = Field(default_factory=list, max_length=25)


class RealtimeJoinResponse(BaseModel):
    status: str
    call_id: str
    agent_user_id: str
    already_running: bool = False


class RealtimeAgentStatusResponse(BaseModel):
    active_calls: list[str]
