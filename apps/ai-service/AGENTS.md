# AI Service Instructions — Interview AI

## 1. Service Goal

Build a focused, maintainable Python AI service for the interview
preparation MVP.

The service accepts authorized, validated requests, runs AI workflows,
and returns validated, documented responses.

## 2. Approved Technology

- Python with the project's supported Python version.
- FastAPI for HTTP APIs.
- Pydantic for request and response validation.
- LangChain only for required model orchestration.
- Gemini as an explicitly configured model provider where appropriate.
- A provider interface for future model replacements.
- Pytest and HTTPX for testing.
- Structured logging and Sentry integration where configured.

Redis and Qdrant are optional until an approved requirement justifies them.
Do not introduce an agent framework, task queue, vector database, or extra
persistence layer just because it may be useful in the future.

Use the existing dependency manager and lockfile. Do not introduce a
second package-management workflow.

## 3. Service Responsibilities

The AI service may implement:
- Resume and job-description analysis.
- Personalized interview-plan generation.
- Context-aware follow-up question generation.
- Answer evaluation using explicit rubrics.
- Final interview reports and feedback.
- Future AI text-review capabilities when approved.

The AI service does not own:
- Frontend rendering or UI state.
- Clerk user-account management.
- Stripe checkout or authoritative billing status.
- GetStream video/chat transport.
- The main application's durable interview history.

Convex remains the application data source of truth unless an approved
architecture decision explicitly changes that responsibility.

## 4. Suggested Code Structure


app/
  api/
    v1/
  core/
  schemas/
  services/
  ai/
    providers/
    prompts/
    orchestration/
  repositories/
  tests/
    unit/
    integration/
    evaluations/

Create files and modules incrementally. Do not generate unused modules
or placeholder abstractions.

## 5. AI Provider Rules

- Keep provider-specific SDK calls behind a small provider interface.
- Do not hardcode a specific model throughout business logic.
- Configure model identifiers and secrets through server-side settings.
- Validate all model outputs using explicit Pydantic schemas.
- Treat model responses as untrusted input.
- Handle malformed JSON, timeouts, rate limits, and provider failures.
- Add retries only where safe and useful.
- Use bounded retries and appropriate timeouts.
- Never retry non-idempotent operations blindly.
- Keep prompts versioned and test important changes.
- Do not change providers or models without evaluating output quality,
  latency, cost, and structured-output compatibility.

Gemini-specific preview models must be explicitly configured. Do not
assume a preview model is stable or available indefinitely.

## 6. Adaptive Interview Rules

For each interview turn, use the relevant:
- Current question.
- Candidate's latest answer.
- Relevant previous conversation.
- Resume and job-description context.
- Interview objectives and remaining time or question budget.

The AI should decide whether to ask a follow-up, clarify an answer,
move to another topic, or finish the interview.

Do not regenerate the entire interview plan on every answer without
a demonstrated need.

Keep question generation and detailed final report generation as separate
operations.

Track interview and turn IDs. Prevent duplicate submissions from creating
duplicate turns or inconsistent state.

Do not treat an AI-generated score as objective truth. Use documented
rubrics and test scoring consistency.

## 7. API and Security Rules

- Version public endpoints under /v1.
- Use explicit Pydantic request and response schemas.
- Return consistent error structures.
- Verify service authentication and authorization at the boundary.
- Do not trust user IDs or permissions supplied only in request bodies.
- Never expose provider credentials or internal exception details.
- Apply request limits, timeouts, and input-size limits.
- Limit resume content and conversation history to necessary context.
- Do not log full resumes or sensitive answers by default.
- Document new or changed endpoints in OpenAPI.
- Keep frontend-facing contracts backward-compatible where practical.

## 8. State and Persistence

- Keep application history and final results in Convex through the
  approved application integration.
- Use temporary in-memory state only when loss on restart is acceptable.
- Use Redis only for a defined caching, coordination, or temporary-state need.
- Use Qdrant only when semantic retrieval is actually required.
- Do not persist duplicate copies of application data without a clear reason.
- Make external calls and persistence retries safe against duplicate effects.

## 9. Testing

- Unit-test business logic without external model calls.
- Mock model providers in deterministic unit tests.
- Test API schemas, authentication failures, timeouts, and invalid inputs.
- Add selected integration tests for configured providers.
- Maintain evaluation examples for interview relevance and scoring quality.
- Test empty, long, ambiguous, and malformed answers.
- Never make normal CI depend on live paid model calls unless explicitly
  configured as a separate integration-test stage.
- Do not claim AI quality is validated based on HTTP status alone.

## 10. Definition of Done

- Request and response schemas are validated.
- Relevant unit, integration, and evaluation tests are run.
- Errors and provider failures are handled.
- API documentation matches actual behavior.
- No unnecessary dependency or unrelated module was introduced.
- Known limitations and unrun tests are reported.
- Stop and request user verification before the next task.