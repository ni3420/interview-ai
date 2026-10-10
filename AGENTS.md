# Project Instructions — Interview AI

## 1. Primary Goal

Build a reliable, maintainable MVP for an AI interview preparation
platform.

The MVP is the priority. Do not build future features, unnecessary
abstractions, or infrastructure without explicit approval.

## 2. Mandatory Workflow

For every task, follow this workflow:

1. Read this file and the relevant app-specific instructions.
2. Inspect the existing code, package files, schemas, API contracts,
   and tests before proposing changes.
3. Identify the exact task, affected files, dependencies, and risks.
4. Run relevant existing tests or checks to establish a baseline.
5. Present a short implementation plan and wait for user approval.
6. After approval, implement only the approved scope.
7. Run relevant tests, linting, type checks, and builds where available.
8. Fix failures caused by the changes. Never hide or skip failures.
9. Summarize changed files, test results, limitations, and any remaining
   issues.
10. STOP and ask the user to verify the milestone before proceeding.

Do not automatically start the next feature after completing a task.
Do not interpret silence as approval.

If the user explicitly approves a bounded group of tasks, complete only
that approved group before stopping at the agreed verification gate.

## 3. MVP-First Rules

- Implement the smallest complete solution that satisfies the requirement.
- Do not add unrequested features, pages, settings, packages, or services.
- Do not build speculative abstractions for hypothetical future features.
- Prefer simple, readable code over clever or unnecessarily generic code.
- Reuse existing utilities and dependencies where appropriate.
- Do not refactor unrelated files during feature implementation.
- Do not introduce microservices beyond the approved application and AI
  service boundaries.
- Ask before expanding scope or changing architectural decisions.

## 4. Architecture Boundaries

- Frontend: Next.js and TypeScript.
- Authentication: Clerk.
- Application data and reactive updates: Convex.
- Application HTTP APIs: Hono where required.
- Request validation: Zod on the TypeScript side.
- UI primitives: shadcn/ui.
- Toast notifications: Sonner through a shared application wrapper.
- Error monitoring: Sentry.
- Video/chat: GetStream when required by the approved MVP.
- Background workflows: Inngest only for tasks that need them.
- Payments: Stripe when billing is in the approved scope.
- AI service: Python and FastAPI.
- AI orchestration: LangChain only where it provides real value.
- AI model access: a provider abstraction with validated outputs.
- Redis and Qdrant: use only when a defined MVP requirement needs them.

Do not introduce a second database, queue, framework, or state-management
library without documenting the reason and getting approval.

## 5. Cross-Application Consistency

- The frontend and AI service must follow the same documented API contracts.
- Define request/response schemas, error formats, and API versions explicitly.
- Never silently rename fields or change response types.
- Validate all untrusted inputs at service boundaries.
- Keep shared business concepts consistent across TypeScript and Python.
- Update contract documentation and tests whenever an approved contract
  changes.
- Prefer OpenAPI for documenting and checking the Python HTTP API.
- Do not expose internal provider details to the frontend.

## 6. Security and Data

- Never expose secrets or private environment variables to the browser.
- Verify identity and authorization on the server.
- Verify resource ownership before reading or modifying user data.
- Do not trust client-supplied scores, payment status, or user IDs.
- Validate file types, sizes, and upload permissions.
- Do not log API keys, tokens, or sensitive resume contents.
- Make retryable operations safe against duplicate processing.
- Do not claim an operation succeeded until its result is confirmed.

## 7. Code Quality

- Follow existing conventions before introducing new ones.
- Keep functions and components focused on one responsibility.
- Avoid giant components, duplicated business logic, and hidden side effects.
- Use explicit types and validated schemas at boundaries.
- Handle loading, success, empty, and error states.
- Keep environment variables documented in an example file without secrets.
- Do not disable lint rules or weaken tests just to make a build pass.
- Do not invent test results or claim tests passed when they were not run.

## 8. Testing Rules

Before changes:
- Inspect existing tests and run relevant baseline checks when possible.

After changes:
- Run relevant unit and integration tests.
- Run lint and type checks for affected applications.
- Run the relevant build or smoke tests when available.
- Add regression tests for changed behavior.
- Report unrun tests and environmental blockers honestly.

Never modify production data or run destructive migrations without approval.

## 9. Approval Gates

STOP and ask for approval before:
- Starting implementation after the initial plan.
- Expanding the approved task scope.
- Adding or replacing dependencies unnecessarily.
- Changing architecture, data ownership, or API contracts.
- Performing destructive database or infrastructure operations.
- Starting the next feature after a completed milestone.

If a requirement is ambiguous and materially affects the implementation,
ask one focused question rather than making a risky assumption.

## 10. Definition of Done

A task is complete only when:
- The approved requirement is implemented.
- Relevant tests and checks have been run.
- Regressions and known limitations are documented.
- Frontend/backend contracts remain consistent.
- The user receives a concise change and test report.
- The agent stops for user verification before moving forward.