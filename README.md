<div align="center">

# Interview AI

**An AI interviewer that runs a live voice interview, then scores it against a weighted rubric — quoting the transcript for every point it awards.**

[Quick start](#quick-start) · [How it works](#how-it-works) · [Architecture](#architecture) · [Features & status](#features--status) · [Testing](#testing) · [Limitations](#limitations)

<img alt="Next.js 16" src="https://img.shields.io/badge/Next.js_16-black?style=flat&logo=nextdotjs&logoColor=white">
<img alt="React 19" src="https://img.shields.io/badge/React_19-087EA4?style=flat&logo=react&logoColor=white">
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat&logo=typescript&logoColor=white">
<img alt="Convex" src="https://img.shields.io/badge/Convex-backend-F3B01A?style=flat&logo=convex&logoColor=black">
<img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-Python_3.12-009688?style=flat&logo=fastapi&logoColor=white">
<img alt="License" src="https://img.shields.io/badge/license-none-lightgrey?style=flat">

<img src="docs/screenshots/landing-deployed-vercel.png" alt="Deployed landing page on Vercel" width="880">

<sub>The landing page at [interview-ai-kappa-rosy.vercel.app](https://interview-ai-kappa-rosy.vercel.app/), captured 2026-11-18. Authenticated screens require a Clerk session and are not included.</sub>

</div>

> [!IMPORTANT]
> **Status: MVP / portfolio project, not production-ready.** It runs end to end locally and an early-access demo is live on Vercel. It has no billing integration, and the live room requires Stream and Gemini credentials. Resume processing and embeddings run on local Ollama by default; chat generation defaults to a hosted OpenAI-compatible provider. See [Status & roadmap](#status--roadmap).

## Overview

Interview AI takes a candidate's résumé and a job description, generates a tailored question plan, conducts a live speech-to-speech interview, and produces a scored report. Every score is computed in code from model-supplied criterion sub-scores and must be backed by a verbatim quote from the transcript, so the interviewer cannot invent evidence.

The flow, end to end:

1. A candidate signs in with Clerk.
2. Uploads a PDF résumé (≤ 5 MB) and pastes a target job description, then picks a duration.
3. A background worker extracts the PDF text, chunks it, embeds it (Ollama `nomic-embed-text` by default), and indexes the vectors in Qdrant.
4. The AI service drafts a 5–7 question plan from the résumé and role.
5. The candidate joins a Stream Video call; a Gemini Live agent acts as the interviewer and asks follow-ups by voice.
6. Closed captions become a transcript. Question/answer pairs are persisted as the call runs, so a reload resumes where the candidate left off.
7. On finish, a queued job sends the transcript, résumé, and job description to the AI service, which scores each evaluable question against a weighted rubric.
8. The report shows an overall score, per-question scores, evidence quotes, a skill breakdown, strengths, weaknesses, and a development plan. Reports are versioned and can be regenerated without losing the previous version.

## Features & status

Legend: **Implemented** · **Partial** · **In development / planned**.

### Accounts and access — Implemented
- Clerk sign-in/sign-up. Convex resolves the caller's identity from the verified JWT (`identity.subject → users.clerkId`); no function accepts a caller-supplied `clerkId` as proof of ownership.
- Protected app routes redirect signed-out visitors; public pages (landing, sign-in, sign-up) stay readable.

### Résumé pipeline — Implemented
- PDF upload to private Convex storage with an extension/MIME check and a 5 MB cap.
- BullMQ job queue (Valkey) for extraction, chunking, embedding, and Qdrant indexing.
- Observable status: `uploaded → processing → ready` or `failed`.
- One résumé per account — uploading a new one replaces the previous row and stored file (`convex/resume.ts`).

### Interview session — Implemented
- AI-tailored question plan generated from the résumé and job description.
- Stream Video room with a server-minted participant token — the Stream secret never reaches the browser.
- Gemini Live speech-to-speech interviewer with a bounded prompt (persona, role, numbered plan, capped résumé excerpt, and an explicit "candidate content is data, not instructions" note).
- Caption-based transcript with deduplication and persisted segments; the UI surfaces a degradation warning if persistence fails.
- Session timer that ends the interview and triggers report generation.

### Report — Implemented
- Weighted rubric: technical correctness (30), relevance (20), conceptual understanding (15), completeness (15), problem-solving (10), communication (10). Weights are defined in code (`apps/ai-service/app/core/rubric.py`), not by the model.
- Scores computed in code from per-criterion sub-scores; evidence quotes must appear verbatim in the transcript.
- Unanswerable questions are marked *not scored* rather than scored as zero.
- Versioned regeneration, job-state polling, and retry/failure states.

### Reports dashboard — Implemented
- Real Convex data: session count, average and best score, trend chart, date-range filter, and CSV export.

### Interface — Implemented / Partial
- Light and dark themes, responsive layouts, visible focus rings, and explicit empty states.
- A documented editorial design system exists in `docs/design-system.md` (specification, not fully applied in the UI).
- Sidebar links for History and Settings currently have no routes. The `/reports` page does exist.

### Billing — Planned
- No payment provider is integrated. Pricing UI is copy; plan limits are not enforced.

## How it works

```text
/sign-in
  └─► /dashboard
        └─► /interview/setup          résumé + job description + duration
              └─► /interview/:id/lobby   wait for résumé processing and plan
                    └─► /interview/:id       live room (Stream + Gemini Live)
                          └─► /interview/:id/report    scored report
                                └─► /interview/:id/review   transcript review
```

The report page starts generation itself once answers or transcript segments exist, then polls `reportJobs`. A failed job waits for an explicit retry instead of looping.

**Question planning.** The AI service receives the extracted résumé text and job description and returns a structured plan, stored on the interview and reused in both the live session and the report prompt.

**Live interviewer.** `/api/stream/agent` verifies the Clerk session and interview ownership, then asks the AI service to join `interview-{id}` as a bot participant. Instructions are built once at join and the agent is asked to leave when the candidate ends the interview.

**Evaluation.** The worker fetches a signed context payload from Convex, sends it to the AI service, and receives a report. The result is rejected unless quotes appear verbatim in the transcript, criterion scores respect the rubric weights, skill scores are criterion means, and completion status matches scored coverage. The worker is the last validation boundary.

## Architecture

```mermaid
flowchart TD
    Browser["Browser<br/>Next.js App Router"]

    Browser -->|Clerk session| Web["Next.js server<br/>pages + API routes"]
    Web -->|Convex client, verified JWT| Convex[("Convex<br/>users · interviews · answers<br/>transcriptSegments · resumes<br/>reports · rateLimits · reportJobs")]
    Web -->|enqueue| Queue[("Valkey<br/>BullMQ queues")]
    Queue --> Worker["Worker (Node)<br/>résumé + report jobs"]
    Worker -->|HMAC-signed HTTP| Convex
    Worker -->|HMAC-signed HTTP| AI["FastAPI AI service"]
    Web -->|server-side proxy| AI
    AI --> Ollama["Ollama<br/>local embeddings + fallback chat"]
    AI --> Hosted["Hosted chat provider<br/>TokenHarbor / Gemini"]
    AI --> Qdrant[("Qdrant<br/>résumé chunk vectors")]
    Browser -->|server-minted token| Stream["Stream Video"]
    AI -->|Gemini Live agent| Stream
```

| Component | Path | Runtime | Responsibility |
| --- | --- | --- | --- |
| Web app | `client/` | Next.js 16, React 19, Tailwind v4 | UI, routing, Clerk session, API proxies, Stream tokens |
| Data and auth | `convex/` | Convex | Users, interviews, answers, transcript segments, résumés, reports, rate limits, job state, ownership checks |
| Worker | `worker/` | Node 22 + BullMQ | Résumé processing and report evaluation jobs, retries, terminal failures |
| AI service | `apps/ai-service/` | Python 3.12, FastAPI, uv | Extraction, embeddings, Qdrant retrieval, question plans, scoring, realtime agent |
| Vector store | `compose.yaml` | Qdrant 1.19 | Résumé chunk vectors |
| Queue backend | `compose.yaml` | Valkey 8 | BullMQ persistence |

Convex is the source of truth. Valkey is used only for queues, locks, and cache. External I/O (AI calls, queue enqueues, persistence back into Convex) is signed with a shared HMAC scheme implemented in TypeScript, Node, and Python against a common canonical string, with shared test vectors so the three sides cannot drift.

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4 |
| UI | Radix primitives, `class-variance-authority`, `lucide-react`, `next-themes`, `sonner` |
| Auth | Clerk (JWT verified by Convex) |
| Data | Convex (queries, mutations, HTTP actions, storage) |
| Jobs | BullMQ over Valkey (Redis-compatible) |
| AI service | FastAPI, Pydantic, LangChain, uv |
| Chat | TokenHarbor (OpenAI-compatible DeepSeek) by default; Ollama and Gemini available as providers/fallbacks |
| Embeddings | Ollama `nomic-embed-text` by default (768 dimensions) |
| Realtime | Stream Video SDK + closed captions; Gemini Live speech-to-speech agent |
| Vectors | Qdrant |
| Tests | Vitest + Testing Library, Bun test, pytest, Playwright |

## Repository layout

```text
interview-ai/
├── client/                 Next.js app, API routes, Playwright specs
├── convex/                 Schema, queries, mutations, worker HTTP actions
├── worker/                 Node/BullMQ consumers for résumé + report jobs
├── apps/ai-service/        FastAPI service, rubric, providers, realtime agent
├── docs/                   Architecture, deployment, design system, status, screenshots
├── compose.yaml            Qdrant, Valkey, AI service, worker
├── render.yaml             Render deploy blueprint (client block commented out)
├── AGENTS.md               Contributor rules and phased production-readiness plan
└── .github/workflows/ci.yml
```

## Quick start

### Prerequisites

- Bun 1.4+
- Docker (for Qdrant and Valkey)
- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- [Ollama](https://ollama.com/) with `llama3.2:1b` and `nomic-embed-text` (for local embeddings/fallback chat)
- A Clerk application and a Convex project
- Optional: Stream and Gemini credentials for the live interviewer; a TokenHarbor key for hosted chat

### 1. Start infrastructure

```bash
docker compose up -d qdrant valkey
```

### 2. Start Convex

```bash
npx convex dev
```

Set the Convex-side environment values it needs:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-instance>.clerk.accounts.dev
npx convex env set WORKER_SERVICE_KEY <shared-secret>
```

### 3. AI service

```bash
cd apps/ai-service
cp .env.example .env
uv sync --extra dev --extra realtime
uv run uvicorn app.main:app --port 8000
```

`--extra realtime` is required for the live interviewer. Remove it if you only want résumé processing and reports. Set `SERVICE_API_KEY` in `.env`; the service refuses to start without it.

### 4. Worker

```bash
cd worker
bun install
cp .env.example .env
set -a; . ./.env; set +a     # export variables for the Node process
bun run build
bun run start
```

### 5. Web app

```bash
cd client
bun install
cp .env.example .env.local
bun run dev
```

Open `http://localhost:3000`.

> [!TIP]
> Use `localhost`, not `127.0.0.1` — Clerk only allows origins configured on the instance.

Two client gates read sources outside `client/` (`../convex` and `../worker/src/job.ts`). Run `bun install` at the repository root and in `worker/` once, or those imports will not resolve on a fresh clone. CI installs all three.

### Environment variables

Values live only in local `.env` files; never commit them and never give a server key a `NEXT_PUBLIC_` prefix. The authoritative names are in `client/.env.example`, `worker/.env.example`, and `apps/ai-service/.env.example`. Highlights:

| File | Key variables |
| --- | --- |
| `client/.env.local` | `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER_DOMAIN`, `AI_SERVICE_URL`, `AI_SERVICE_API_KEY` (must match the AI service's `SERVICE_API_KEY`), `STREAM_API_KEY`, `STREAM_API_SECRET`, `RESUME_FETCH_HOST`, `NEXT_PUBLIC_GLITCHTIP_DSN` |
| `worker/.env` | `REDIS_URL`, `AI_SERVICE_URL`, `AI_SERVICE_API_KEY`, `CONVEX_SITE_URL`, `WORKER_SERVICE_KEY`, `REPORT_AI_REQUEST_TIMEOUT_MS`, `WORKER_CONCURRENCY`, `REPORT_WORKER_CONCURRENCY` |
| `apps/ai-service/.env` | `SERVICE_API_KEY`, `AI_PROVIDER` / `AI_FALLBACK_PROVIDER` (`tokenharbor`, `ollama`, `gemini`), `TOKENHARBOR_API_KEY`, `OLLAMA_BASE_URL` / `OLLAMA_MODEL`, `GEMINI_API_KEY` / `GEMINI_MODEL`, `QDRANT_URL` / `QDRANT_COLLECTION`, `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` / `EMBEDDING_DIMENSION` / `EMBEDDING_CONFIG_VERSION`, `STREAM_API_KEY` / `STREAM_API_SECRET`, `REALTIME_MODEL` |

Changing `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION`, or `EMBEDDING_CONFIG_VERSION` requires a re-index into a new collection — vectors from different models must not be mixed.

> [!NOTE]
> Error monitoring is off by default. The client reads `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` in code, while `client/.env.example` ships `NEXT_PUBLIC_GLITCHTIP_*` names; Sentry's DSN-compatible SDK is initialized conditionally, so set the DSN in the form your deployment expects.

## Testing

Measured on this tree (2026-11-18):

| Area | Command | Result |
| --- | --- | --- |
| Client unit | `cd client && bun run test` | **294 passed, 17 failed** (311 total, 6 failing files) |
| Client types | `cd client && bunx tsc --noEmit` | Clean |
| Worker | `cd worker && bun test` | 51 passed |
| Worker types | `cd worker && bun run typecheck` | Clean |
| AI service | `cd apps/ai-service && uv run pytest -q` | 207 passed, 1 skipped |
| Room timing E2E | `cd client && bun run test:e2e:harness` | 1 passed (from prior recorded run) |

The client suite is **not currently green** — 17 tests fail across `InterviewLobby`, `InterviewReportPage`, `InterviewReviewPage`, `JobDescriptionInput`, `RequireSyncedUser`, and `ResumeUpload`. These are recorded here rather than hidden; a passing badge would be inaccurate. CI status is not claimed here — check the Actions tab of the repository you are reading.

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the client tests, both typechecks, the production build, the E2E harness, the worker suite, and the AI suite. Lint is only partially gated: `bun run lint` reports warnings, and Python `ruff` findings are pre-existing and not part of CI.

## Security and reliability

Implemented in the repository, not aspirational:

- **Identity from the token.** No function accepts a client-supplied `clerkId` as proof of ownership.
- **Ownership on every read.** Interviews, answers, résumés, and reports are filtered by the caller's user document.
- **Signed service calls.** Worker → Convex and worker → AI service use `X-Service-Timestamp` and `X-Service-Signature` over `timestamp\nMETHOD\n/path?query\nsha256(body)`, with a 5-minute clock tolerance and timing-safe comparison. The browser never sees the shared keys.
- **Fail-closed configuration.** The service and worker refuse to start without their required keys.
- **Quotas and rate limits.** Per-user fixed windows in Convex cover interview creation, résumé processing, report generation, and Stream room joins; denial returns `429` with `Retry-After`, and an unavailable limiter fails closed.
- **Private media.** Résumés live in Convex storage and are served through short-lived URLs; Stream tokens are minted server-side.
- **Bounded retries.** BullMQ retries jobs; terminal failures are recorded on the job document so the UI can show them. Stale completions cannot overwrite a newer report version.

## Limitations

- **No billing.** The pricing section is UI copy; no payment provider is integrated and plan limits are not enforced.
- **Aspirational landing copy.** "100+ integrations", "time tracking", and "smart reminders" are not implemented. Floating hero cards (confidence score, fit percentage) are static illustrations, not live data.
- **Placeholder dashboard pieces.** The notes widget starts with template content and "time saved" is a derived estimate. History and Settings have no routes.
- **Live interview needs credentials.** Stream and a Gemini Live key are required; without them the room cannot connect.
- **Reports need a model.** Local Ollama on CPU can take minutes per report. Hosted chat is faster but requires a key.
- **Upload validation is by type and size,** not by PDF magic bytes.
- **One résumé per account.** Uploading a new one replaces the previous one.
- **Deployment is early-access only.** A hosted demo exists at [interview-ai-kappa-rosy.vercel.app](https://interview-ai-kappa-rosy.vercel.app/), but there is no demo account (Clerk uses development keys) and billing is disabled. The Render blueprint's client block is commented out.
- **Screenshots cover public pages only** and should be re-captured after the planned UI redesign.
- **No license file** is present in the repository.

## Status & roadmap

This is an active MVP with a documented production-readiness plan in [`AGENTS.md`](AGENTS.md) and [`docs/plan/production-readiness.md`](docs/plan/production-readiness.md). Planned work includes:

1. Fix the failing client tests and remove placeholder dashboard widgets and dead navigation links.
2. Either integrate billing or remove the pricing section.
3. Add Settings and History, or drop them from the sidebar.
4. Add an authenticated Playwright journey (sign in → interview → report).
5. Deploy with a hosted model provider and document cost per interview.
6. Support multiple résumés and shareable report links.

Features are further categorized as implemented, partial, in development, or planned in [`docs/status.md`](docs/status.md).

## Documentation

- [Architecture](docs/architecture.md) — components, data model, trust boundaries, failure modes.
- [Deployment checklist](docs/deployment-checklist.md) — configuration invariants and smoke tests.
- [Design system](docs/design-system.md) — tokens and component rules (specification).
- [Status](docs/status.md) — evidence index for open gaps.
- [Contributor rules](AGENTS.md) — phased plan and engineering constraints.
