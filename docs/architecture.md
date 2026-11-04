# Interview AI — Architecture (as built)

> Status: verified against the working tree on 2026-10-28.
> This document describes what the repository actually runs. Anything not
> listed here does not exist yet, regardless of what older plans said.

## 1. Components

| Component | Path | Runtime | Owns |
|---|---|---|---|
| Web app | `client/` | Next.js 16.4 (App Router), React 19.3, Tailwind v4, TypeScript strict | UI, routing, Clerk session, proxying to AI service, Stream tokens |
| Application data | `convex/` | Convex (local backend on :3211) | Users, interviews, answers, résumés, reports, report job state |
| Worker | `worker/` | Node + BullMQ over Valkey (:6379) | Résumé processing queue, report generation queue, retries, terminal failure reporting |
| AI service | `apps/ai-service/` | Python FastAPI (uv), port 8000 | Chunking, embeddings, Qdrant retrieval, question plan, evaluation, report synthesis, realtime vision agent |
| Vector store | `compose.yaml` → qdrant | Qdrant 1.19 (:6333) | Résumé chunk vectors |
| Cache/queue | `compose.yaml` → valkey | Valkey 8 | BullMQ persistence |

Client dependencies of note: `@clerk/nextjs` 6, `convex`, `@stream-io/video-react-sdk`,
`@stream-io/node-sdk`, `next-themes`, `sonner`, Radix primitives, `class-variance-authority`,
`zod`, `react-hook-form`, `bullmq`, `ioredis`, `@sentry/nextjs` (installed, not initialized).

The repository is **not** a configured workspace: `client/`, `worker/` and
`apps/ai-service/` each install and build independently. The root `package.json`
only pins `convex`. `apps/web/` is not a component — it contains only a stale
`AGENTS.md` and no source.

## 2. Topology

```
Browser
  │  Clerk session cookie
  ▼
Next.js (3000)
  ├── Convex client ──────────────► Convex backend (3211)
  │                                   ▲           ▲
  │                                   │           │ X-Worker-Key (service auth)
  │                                   │           └── Worker (BullMQ, 2 queues)
  │                                   │                   │
  ├── /api/ai/[...path] (allowlist) ──┼──────────► FastAPI (8000) ──► TokenHarbor / Ollama / Gemini
  │      X-API-Key                    │                   │
  │                                   │                   └──► Qdrant (6333)
  ├── /api/resume/process ────────────┼── enqueue ──► Valkey (6379)
  ├── /api/report/generate ───────────┼── enqueue
  ├── /api/stream/token ──────────────┼── Stream token (never the secret)
  └── /api/stream/agent ──────────────┴──► AI service realtime agent ──► Stream
```

## 3. Data model (`convex/schema.ts`)

| Table | Key fields | Indexes | Notes |
|---|---|---|---|
| `users` | `clerkId`, `email`, `name`, `imageUrl` | `by_clerk_id`, `by_email` | No billing or plan fields exist. Written only from the verified JWT: `users.syncUser` (profile fields only, never an identity) and `interviews.createInterview` share `upsertUserFromIdentity` (G-01, G-50). `by_email` is not a unique index — Convex has none — it is the lookup the one-address-one-account check in S19 uses (G-53) |
| `interviews` | `userId`, `resumeId?`, `resumeText?`, `jobDescription`, `status` (`setup`/`in_progress`/`completed`/`failed`), `plan`, `currentQuestionIndex`, `durationMinutes`, timestamps | `by_user`, `by_user_status` | `plan` is `v.any()` — question plan is stored untyped |
| `answers` | `interviewId`, `questionIndex`, `question`, `answer`, `followUpCount` | `by_interview` | No per-answer score; scoring lives in `reports` |
| `resumes` | `userId`, `storageId`, `fileName`, `contentType`, `size`, `status` (`uploaded`/`processing`/`ready`/`failed`) | `by_user` | Blob in Convex storage |
| `reports` | `interviewId`, `userId`, `overallScore`, `strengths[]`, `weaknesses[]`, `recommendations[]`, `questionScores[]` | `by_interview`, `by_user` | Written only by the worker |
| `reportJobs` | `interviewId`, `userId`, `status` (`queued`/`processing`/`completed`/`failed`), `error?` | `by_interview`, `by_user` | Lets the UI observe async progress |

Ownership rule: every table except `users` carries a `userId` or is reachable
through an interview that does. Queries must filter by the caller's user document,
not by an id supplied by the client.

## 4. Identity and authorization

1. **Browser → Convex.** Clerk JWT is forwarded by the Convex client. `convex/auth.ts`
   resolves `identity.subject` → `users.clerkId` → `users._id`. `requireAuthUserId`
   throws when no mapping exists. `upsertUserFromIdentity` is the only writer and reads
   the identity itself — no function takes a `clerkId` or `userId` from arguments
   (G-01, G-50). `users.syncUser` additionally accepts `email`/`name`/`imageUrl` because
   the Clerk JWT reaching Convex carries no email/name/picture claim (verified 2026-10-29:
   an identity-only sync left the row with `email: ""` and no `name`/`imageUrl`);
   those are declared display values (S10), length-bounded and blank-rejected, and the
   row is still keyed by `identity.subject`, so a forged `clerkId` is rejected by the
   argument validator. Precedence is identity claim → declared value → stored value, so
   claims win when the template is later fixed.
   One email address owns one row (S19, G-53): `upsertUserFromIdentity` folds the address
   with `trim().toLowerCase()` — `A@x.com` and `a@x.com` are the same account — searches
   `by_email`, and throws `EMAIL_ALREADY_LINKED` rather than inserting a second row for an
   address another row owns; a returning row keeps its own stored address instead of
   adopting a contested one. An empty address is never matched, because rows written
   before this rule have `email: ""` and matching blanks would lock every later
   email-less sign-in out. `users.getSyncStatus` answers `anonymous`
   (token has not
   reached Convex yet), `unsynced` (identity, no row) or `synced`; `interviews.createInterview`
   creates the owner row in its own transaction, so an interview is never written without
   one. `interviews.getInterviews`/`getInterview` answer `[]`/`null` for an identity with
   no row — that caller owns nothing, and a thrown query would crash the page that is
   still waiting; mutations stay fail-closed.
2. **Browser → Next.js.** `client/src/proxy.ts` (Clerk middleware) guards only
   `/dashboard(.*)` and `/interview(.*)`. `/reports` guards itself with a client effect.
   `UserSyncProvider` in the root layout redirects a signed-out visitor to `/sign-in`,
   except on the public landing page `/` and on `/sign-in` or `/sign-up`. The landing
   page must stay readable while signed out, and the auth pages are where a refused
   visitor can act (G-21, G-53).
   A sync refused with `EMAIL_ALREADY_LINKED` is not retried: the provider replaces the
   URL with `/sign-up?reason=email-taken`, `RequireSyncedUser` keeps the protected surface
   closed through the navigation, and the sign-up page reads the query and shows
   "This email address is already in use" with a link to `/sign-in` (G-53).
   `RequireSyncedUser`, applied inside `DashboardLayout`, holds `/dashboard`, `/reports`
   and every `/interview/*` page (setup, lobby, room) until `getSyncStatus` reports
   `synced`, so their queries and mutations never run against a missing row; a failed sync
   shows a named retry state instead of an error boundary (G-50). A sync rejected with
   `EMAIL_ALREADY_LINKED` gets its own named state and no retry button — the page is only
   the hand-off, because repeating the call cannot free an address another account owns
   (G-53). `/dashboard` and
   `/reports` also skip their own page-level queries until `synced`, because those hooks
   run outside the gate's children. `UserSyncProvider` pushes the Clerk profile once per
   distinct profile — including over a row already reported `synced` — so a row created
   before the profile existed gets its name, email and image backfilled.
3. **Worker → Convex.** Six HTTP actions under `/worker/*` in `convex/http.ts`
   (`resume-complete`, `resume-failed`, `report-context`, `report-start`,
   `report-complete`, `report-failed`), authenticated with `X-Worker-Key` compared
   against `WORKER_SERVICE_KEY`. Missing configuration fails closed (`return false`).
4. **Next.js → AI service.** `/api/ai/[...path]` requires a Clerk session, only
   forwards `v1/interviews/plan`, `next-question`, `evaluate`, and sends
   `X-API-Key` from `AI_SERVICE_API_KEY`. Upstream timeout is
   `AI_REQUEST_TIMEOUT_MS` (default 900 s because local Ollama is slow).
5. **Browser → Stream.** `/api/stream/token` mints a participant token server-side.
   The Stream secret never reaches the client.

## 5. Flows

### F1 — Résumé upload → parsed → indexed

1. Client uploads the file to Convex storage and inserts `resumes` with status `uploaded`.
   `saveResume` deletes every prior résumé row and blob for the user first, so only one
   résumé exists per account and an in-flight job can lose its file (G-31).
2. `/api/resume/process` enqueues a BullMQ job. It requires `resumeId`: `getProcessingContext`
   returns `null` without one (G-14).
3. Worker sets status `processing` via the internal Convex mutation, extracts text and
   calls the AI service to chunk/embed into Qdrant.
4. On success the worker calls `/worker/resume-complete` with `resumeText`, `chunkCount`
   and the generated `plan` (questions + focus areas); Convex marks the résumé `ready`.
5. On terminal failure (retries exhausted) `/worker/resume-failed` marks it `failed`.
   Intermediate retries must not mark the UI failed.

### F2 — Interview setup → live session

1. `/interview/setup` requires a résumé (client validation `min(1)`) and a job description of
   at least 50 characters. There is no JD-only or résumé-only mode (G-14).
2. AI service `v1/interviews/plan` produces a 5–7 question plan (the prompt target); the
   interview is stored with `status: setup`, then `in_progress` on start.
   `updateInterviewStatus` accepts any status from the client without a transition check
   (G-23).
3. Lobby requests `/api/stream/token`; the room joins a Stream call.
4. The realtime vision agent (`/api/stream/agent` → AI service `realtime/runner.py`)
   drives Gemini Live for spoken turns.

### F3 — Live interview (as built)

1. `/interview/[id]` mounts `StreamProvider`: `POST /api/stream/token` (Clerk session →
   ownership check → participant token), `call.join({ create: true })`, then captions via
   `startCaptionsWhenPresent` (`room-captions.ts`): it waits up to 15 s for a remote
   participant before `startClosedCaptions({ language: "en" })`, and restarts captions if
   the interviewer joins after that cap. The restart is a safety net; that no-caption case
   has not been reproduced live.
2. `POST /api/stream/agent` runs fire-and-forget: Clerk session → `interviews.getInterview`
   (ownership) → AI service `POST /v1/realtime/join-call` with `call_id =
   interview-${interviewId}`, the job description, the plan's questions and `resumeText`.
   The service starts a vision-agents `Agent` (Gemini Live) in a background task and
   returns `started | already_running`. The vision-agents import runs in the FastAPI
   lifespan (`~13 s` cold, measured 2026-11-01), so it does not block the first join; the
   Next route still has a 15 s timeout. There is no "agent joined" acknowledgement, so the
   first question arrives after the model connects. On "End interview" the room calls
   `POST /api/stream/agent/leave` so the interviewer leaves the call instead of waiting for
   it to end.
3. Instructions are built once at join (`realtime/instructions.py`): base persona + JD +
   numbered plan (capped at 25) + résumé excerpt (capped at 6 000 chars) + an
   untrusted-data note; `@` is rewritten to `(at)` because the instruction container
   parses `@file` references. **No retrieval happens during the call** (G-16).
4. Turns are captured from `call.closed_caption` events. `TranscriptionPanel` dedupes by
   `speaker_id|start_time` and seeds itself from stored `transcriptSegments` on reopen;
   `useTranscriptRecorder` reduces question/answer pairs and serially calls
   `answers.saveAnswer`, which upserts on (`interviewId`, `questionIndex`) through the
   `by_interview_question` index, resuming at the next index after a reload. Writes retry
   twice and set `persistenceDegraded` when they keep failing. Candidate speech that
   follows no interviewer question is not written as a Q&A row (G-17); its raw segment is
   still persisted for the report.
5. "End interview" calls `interviews.updateInterviewStatus(completed)`, tells the
   interviewer to leave (`POST /api/stream/agent/leave` → `/v1/realtime/leave`; fire-and-forget,
   non-fatal) and navigates to `/interview/[id]/report`. Closing the tab does not end the
   call or the interview.
6. Failure modes: dispatch failure is `toast.warning` only (G-13); there is no agent
   reconnect, no dead-letter record and no server-side retry.

### F3b — Answer evaluation

- There is no live text answer path. Persisted answers and raw transcript segments are
  evaluated only by the report worker (F4), which posts them to `v1/interviews/report`
  together with the résumé text and job description.
- The AI service is not a trust boundary: identity, ownership and interview state are
  re-checked in Convex before results are attached to an interview.
- Question coverage depends on which input exists. With segments, the AI service extracts
  interview questions from the transcript, so an answer the ASR merged into an earlier
  question is not scored separately (remaining G-20). Without segments, each saved answer
  becomes one question and the worker rejects a report that drops any of them.
- The worker is the last validation boundary: quotes must be verbatim, question and overall
  scores must follow the rubric weights, skill scores must be the criterion means, and
  completion status must match scored coverage before anything is written.

### F4 — Report generation

1. `/api/report/generate` inserts `reportJobs.status = queued` and enqueues a job.
2. Worker fetches context via `/worker/report-context`, calls the AI service, then
   `/worker/report-start` → `/worker/report-complete` (validated: non-empty
   strengths/weaknesses/recommendations and typed `questionScores`) or
   `/worker/report-failed`.
3. `/interview/[id]/report` renders from `reports`; the UI polls `reportJobs`.

## 6. Trust boundaries

- **Clerk → Convex** is the only source of user identity. Never accept a `clerkId`,
  `userId` or owner id from a request body as proof of identity.
- **Candidate content** (résumé text, answers, job description) is untrusted data,
  never instructions. Prompts must delimit it and refuse instruction-like content.
- **AI service** is an internal dependency, not an authorization authority. It cannot
  know who owns an interview; Convex must.
- **Worker** is trusted only through the service key, and only for its own routes.
- **Outbound** calls from the AI service must use an allowlist; no user-supplied URLs.

## 7. Failure and degradation

| Failure | Current behaviour |
|---|---|
| AI provider down or model missing | `specific` mode falls back to `AI_FALLBACK_PROVIDER`; `any` mode skips unhealthy providers; `all` mode returns partial results and raises only when every provider fails. Errors surface as 502/504 from the proxy |
| AI generation exceeds budget | Proxy aborts at 900 s, returns 504 |
| Worker crash mid-job | BullMQ retries; terminal failure path marks the record failed |
| Convex worker endpoints unconfigured | 401 (fail closed) |
| Stream token failure | Lobby shows a state error; no silent retry loop |
| Agent dispatch fails (502/503/15 s timeout) | Warning toast, interview continues with no interviewer participant; no retry, no persisted failure (G-13) |
| Interviewer captions never arrive | Transcript shows candidate turns only; question text is lost and scores cannot be attributed (G-17) |
| Stream token expires mid-interview | 3600 s validity; a 60-minute session cannot reconnect after the token lapses (G-26) |
| Non-PDF bytes uploaded with a PDF name/MIME | Accepted; extraction fails later with 422 and the résumé is marked failed (G-24) |
| Sentry | **No `Sentry.init`/`withSentryConfig` anywhere.** `lib/glitchtip.ts` wraps five call sites but events are dropped |

### Provider selection (as built, 2026-11-04)

`apps/ai-service/app/ai/providers/` is the only place that knows provider names:

| Module | Responsibility |
|---|---|
| `base.py` | `ChatRequest`/`ChatResponse`, capability metadata, `BaseChatProvider`, normalized failures |
| `registry.py` | name → adapter factory, lazy singleton instances |
| `routing.py` | health TTL cache, `any` selection, concurrent `all` fan-out, per-call timeout |
| `factory.py` | env-driven mode/order validation, specific-mode fallback, log fields |
| `openai_compatible.py` | shared `/chat/completions` adapter; `tokenharbor` is the default chat provider (`deepseek-v4.1-flash:free`) |

Controllers and report services call `get_llm_provider()` and never import a vendor module.
Current chat adapters are `tokenharbor`, `gemini` and `ollama`; embeddings
(`app/services/embeddings.py`) and the realtime Gemini Live agent remain separate
capabilities because they do not share the chat interface. `all` mode returns normalized
successes plus per-provider failures; single-response workflows use the first successful
response in candidate order. The OpenAI-compatible adapter uses `httpx`, not a vendor SDK,
so another compatible gateway only needs settings and a one-line registration.

## 8. Environment

| Variable | Consumer | Required |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | client | yes |
| `NEXT_PUBLIC_CONVEX_URL` | client | yes |
| `AI_SERVICE_URL` | client proxy, worker | yes |
| `AI_SERVICE_API_KEY` | client proxy, worker | yes |
| `SERVICE_API_KEY` | AI service | yes — compose maps `AI_SERVICE_API_KEY` onto this name |
| `STREAM_API_KEY`, `STREAM_API_SECRET` | client + AI service | for live interviews |
| `AI_PROVIDER`, `AI_FALLBACK_PROVIDER` | AI service | primary/fallback names |
| `AI_PROVIDER_MODE`, `AI_PROVIDER_ORDER` | AI service | `specific`/`any`/`all`; any/all candidate order |
| `AI_PROVIDER_TIMEOUT_SECONDS`, `AI_HEALTH_CHECK_TTL_SECONDS`, `AI_HEALTH_CHECK_TIMEOUT_SECONDS` | AI service | routing bounds; defaults are safe |
| `TOKENHARBOR_API_KEY` | AI service | yes for the default `tokenharbor` provider |
| `TOKENHARBOR_BASE_URL`, `TOKENHARBOR_MODEL`, `TOKENHARBOR_TEMPERATURE`, `TOKENHARBOR_MAX_TOKENS`, `TOKENHARBOR_TIMEOUT_SECONDS` | AI service | optional (defaults exist) |
| `TOKENHARBOR_INPUT_PRICE_PER_1M`, `TOKENHARBOR_OUTPUT_PRICE_PER_1M` | AI service | optional; unset logs `estimatedCostUsd: null` |
| `OLLAMA_*`, `GEMINI_API_KEY`, `GEMINI_MODEL` | AI service | provider-dependent |
| `REALTIME_MODEL`, `REALTIME_MAX_QUESTIONS`, `REALTIME_MAX_RESUME_CHARS` | AI service | for live interviews |
| `QDRANT_URL`, `QDRANT_API_KEY`, `QDRANT_COLLECTION` | AI service | yes |
| `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION`, `EMBEDDING_CONFIG_VERSION` | AI service | yes |
| `REDIS_URL` | client producer + worker | yes |
| `RESUME_QUEUE_NAME`, `REPORT_QUEUE_NAME` | client producer, worker | optional (defaults exist) |
| `REPORT_AI_REQUEST_TIMEOUT_MS` | worker | optional |
| `WORKER_SERVICE_KEY`, `CONVEX_SITE_URL` | worker ↔ Convex | yes |
| `WORKER_CONCURRENCY`, `REPORT_WORKER_CONCURRENCY` | worker | optional |
| `RESUME_FETCH_HOST` | client producer | optional — rewrites the storage host for Docker |

`STRIPE_*`, `SENTRY_*`, `NEXT_PUBLIC_SENTRY_DSN` and `ADMIN_CLERK_IDS` appear in
`client/.env.example` but no code reads them (G-03, G-02) — billing and error reporting are
not implemented.

Local: `docker compose up -d qdrant valkey` then `cd client && bun run dev`,
`cd worker && bun run build && bun run start`, `cd apps/ai-service && uv run uvicorn app.main:app`.
The client and worker read `client/.env.local` and `worker/.env`; the AI service reads
`apps/ai-service/.env`, where the key is named `SERVICE_API_KEY`, not `AI_SERVICE_API_KEY`.

## 9. Verified gaps

The debt register lives in `AGENTS.md` (priority, rule, fix, owner) with the evidence index
in `docs/status.md` (file and line per ID). This section used to duplicate the register and
drifted: it stopped at G-31 and kept the retired P0/P1/P2 severities. Do not re-add rows
here — add the gap to `AGENTS.md`, the evidence to `docs/status.md`, and a behavioural
summary to §7 if the running system changes.

## 10. Change protocol

1. Update this file in the same change that alters a component, table, route or contract.
2. Record decisions that change direction in `docs/decisions/NNNN-*.md`.
3. Security or ownership changes require the Security (S) rules in `AGENTS.md`.
4. Design changes must satisfy `docs/design-system.md` §13.
