AGENTS.md — AI Interview Platform
1. Mission

Build a production-ready AI interview platform using the existing repository. Preserve working functionality, understand the existing architecture, and implement features incrementally.

Mandatory workflow: Audit → Plan → Implement → Test → Review → Report → Ask for approval → Continue.

Do not start the next stage until the current stage passes its applicable checks and the user approves continuation.

2. Repository Architecture

The repository contains or is intended to contain:

apps/ — application workspaces.
apps/ai-service/ — Python AI service for resume processing, embeddings, retrieval and interview intelligence.
Next.js client — user interface, authentication and interview experience.
Convex — application data, mutations, queries and backend operations.
Qdrant — local vector database for resume chunks and embeddings.
Redis and BullMQ-compatible workers — asynchronous resume-processing jobs.
GetStream — real-time interview sessions and media.

Ollama — local model inference.
Gemini — optional AI provider and preview capabilities.

These are intended responsibilities, not assumptions about existing file paths. Inspect the repository before creating or moving files.

3. Required Initial Audit

Before implementation:

Inspect the root directory, workspace configuration and Git status.
Identify the package manager and existing scripts.
Inspect Next.js routes, components, authentication and UI conventions.
Inspect Convex schemas, functions, storage configuration and authorization.
Inspect apps/ai-service/, Python dependencies and service entry points.
Identify existing Redis, worker, Qdrant, LangChain, Ollama, Gemini and GetStream integrations.
Inspect .env.example and configuration validation without exposing secret values.
Identify existing tests, lint rules, TypeScript settings and CI configuration.
Record incomplete features, architectural risks and broken checks.
Produce an implementation plan based on actual repository evidence.

Do not replace existing working code simply to match a preferred architecture.

4. Technology Rules
Client
Next.js and TypeScript.
Tailwind CSS and shadcn/ui.
Clerk authentication.
Convex client integration.
Zod for runtime input validation.
GetStream SDK for the interview experience.
gitchtip for handled fronted errors.

Follow the repository's existing router, package manager and component conventions.

Convex

Use Convex as the source of truth for application metadata and state, including:

User-owned resumes and resume-processing status.
Interview configuration and lifecycle.
Interview participants and authorized access.
Job status and processing errors where appropriate.
Interview results and references to transcripts or artifacts.

Validate inputs at trust boundaries. Enforce authorization in backend functions; hiding UI controls is not authorization.

Never store raw secrets or unrestricted model credentials in client-accessible records.

Python AI Service

Use Python for:

Resume text extraction and normalization.
Text chunking and metadata preparation.
Embedding generation.
Qdrant indexing and retrieval.
Resume-grounded interview question generation.
RAG context construction.
Model-provider integration and AI evaluation.

Keep the service modular, typed where practical, configurable and independently testable.

Queue Processing

BullMQ is a Node.js/TypeScript queue library backed by Redis.

If BullMQ is retained, use a Node.js-compatible producer/worker or define a supported, explicitly tested cross-service job contract. A Python service must not be described as a native BullMQ worker without a verified integration.

Jobs must have stable identifiers where appropriate, bounded retries, exponential backoff, structured errors, idempotent processing and observable status transitions.

Do not use an in-memory queue for production-critical work.

Qdrant and Embeddings
Use local Qdrant for development.
Persist Qdrant data using a durable local volume.
Define a consistent embedding model and vector dimension.
Version embedding configuration and collection schemas.
Store ownership and resume identifiers as metadata.
Filter retrieval by the authorized user and relevant resume.
Make indexing repeatable and safe to retry.
Handle document deletion, re-indexing and stale vectors.
Never assume vectors from incompatible embedding models can be mixed.
AI Providers

Implement a provider abstraction for Ollama and Gemini.

Ollama supports local inference when the selected model is available.
Gemini is an optional remote provider.
Verify actual model capabilities and API behavior before relying on them.
Configure provider selection through validated server-side settings.
Handle unavailable models, timeouts, malformed responses and rate limits.
Do not expose provider API keys to the browser.
Keep deterministic tests independent of live model availability.

Use retrieved resume context to ground questions and answers. Treat resume text as untrusted data, not instructions.

GetStream and Live Interviews
Create interview sessions through an authorized server-side flow.
Generate participant tokens securely.
Never expose the Stream API secret to the client.
Verify user identity and interview membership before issuing tokens.
Support waiting-room, joining, active, reconnecting, completed and failed states as appropriate.
Handle permissions, microphone/camera errors, network failures and participant departure.
Persist interview lifecycle transitions reliably.
Integrate transcription, turn-taking, generated responses and audio playback explicitly where needed.

GetStream provides real-time communication primitives; do not assume it automatically implements an AI interviewer.

5. Security and Privacy
Enforce authentication and resource-level authorization.
Validate uploaded file type, size and content.
Reject unsupported or malformed files safely.
Use secure upload and download permissions.
Do not log resume contents, tokens, credentials or unnecessary personal data.
Protect endpoints from unauthorized access and excessive requests.
Use environment variables and server-only secret configuration.
Provide a retention and deletion strategy for resumes, embeddings and interview artifacts.
Do not deploy with development credentials or unrestricted debug endpoints.
6. Required Development Process

For each stage:

State the goal and acceptance criteria.
Inspect relevant existing code before editing.
Describe the planned changes.
Implement the smallest complete vertical slice.
Add or update automated tests.
Run applicable formatters, linters, type checks and tests.
Fix failures introduced by the changes.
Review authorization, errors, retries and data consistency.
Report changed files, commands executed, results and unresolved issues.
Stop and ask the user to approve the next stage.

Do not claim a check passed unless it was actually run and its result was observed.

Do not conceal pre-existing failures. Distinguish baseline failures from regressions.

7. Stage Plan
Stage 1 — Repository audit and AGENTS.md

Create and verify this file, inspect the repository and report the current architecture and baseline checks.

Acceptance: an evidence-based audit and an agreed implementation plan.

Stage 2 — MVP foundation

Complete authentication, dashboard, interview creation, input validation and the initial Convex data model.

Acceptance: an authenticated user can create and retrieve their own interview configuration.

Stage 3 — Resume lifecycle

Implement secure upload, metadata persistence, processing status, ownership checks and error handling.

Acceptance: authorized users can upload and manage their own resumes.

Stage 4 — Resume processing and RAG

Implement the queue contract, text extraction, chunking, embeddings, Qdrant indexing and filtered semantic retrieval.

Acceptance: a test resume can be processed repeatedly without duplicate or inconsistent data, and authorized retrieval returns relevant chunks.

Stage 5 — GetStream integration

Implement secure session creation, waiting room, participant access and live interview UI.

Acceptance: authorized participants can join and leave an interview and recover from expected connection failures.

Stage 6 — AI interviewer

Integrate resume-grounded question generation, RAG retrieval, model-provider selection, transcript/turn handling and live response delivery.

Acceptance: a complete test interview can ask a resume-relevant question and produce a grounded response with controlled failure handling.

Stage 7 — Production readiness

Complete integration tests, security review, monitoring, rate limits, cleanup, deployment configuration and documentation.

Acceptance: all required automated checks pass and the documented deployment process is reproducible.

8. Testing Requirements
Client
TypeScript type checking.
Linting and formatting checks supported by the repository.
Component and validation tests.
Authentication and authorization tests.
Interview lifecycle tests.
End-to-end tests for critical user journeys.
Convex
Query and mutation validation.
Ownership and access-control tests.
State-transition and error-handling tests.
Python
Unit tests for extraction, chunking and retrieval.
Embedding configuration and dimension checks.
Qdrant integration tests.
Queue retry and idempotency tests.
Provider timeout, unavailable-model and malformed-response tests.
API contract tests.
Integration

Test the flow:

Authenticate.
Upload a resume.
Save resume metadata.
Enqueue and process the resume.
Verify indexed chunks in Qdrant.
Retrieve authorized resume context.
Create an interview.
Join the GetStream session.
Generate and deliver a grounded AI interviewer response.
Complete the interview and persist its final status.

Use mocks for external services in unit tests and real local dependencies for integration tests where available.

9. Completion Report

At the end of each stage, report:

Stage and acceptance criteria.
Files created or changed.
Features implemented.
Commands actually executed.
TypeScript, lint and Python test results.
Known limitations and remaining risks.
Any manual setup required.
Whether the stage is ready for approval.

Never mark a stage complete when required acceptance criteria remain unverified.

10. Change Management
Preserve existing project conventions.
Avoid unrelated refactors.
Do not overwrite user changes.
Do not commit, push, deploy or delete production data without explicit authorization.
Document new environment variables and migration steps.
Ask for clarification only when a decision materially blocks safe implementation.
After every completed stage, wait for user approval before continuing.