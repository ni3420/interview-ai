# Deployment checklist — Interview AI

Verified against the working tree at commit `4e3dec1` on **2026-10-31**. This document is a
checklist, **not** an authorization to deploy, spend provider quota, or change production
data. Rules live in [AGENTS.md](../AGENTS.md); the issue register lives in
[plan/production-readiness.md](plan/production-readiness.md).

Re-check every claim below before relying on it; the code moves faster than this file.

## 0. Non-negotiable invariants

These come from the code, not from preference. If one is violated, stop and fix it
before continuing.

- [ ] **No secret in a `NEXT_PUBLIC_*` variable.** `NEXT_PUBLIC_*` reaches the browser.
      Server-only keys are `AI_SERVICE_API_KEY`, `WORKER_SERVICE_KEY`, `SERVICE_API_KEY`,
      `STREAM_API_SECRET`, `CLERK_SECRET_KEY`, `REDIS_URL`.
- [ ] **The AI service rejects bare `X-API-Key` outside `development`/`test`**
      ([deps.py](../apps/ai-service/app/api/deps.py)). Every non-dev call must carry
      `X-Service-Timestamp` + `X-Service-Signature` (HMAC-SHA256 over
      `timestamp\nMETHOD\n/path?query\nsha256_hex(body)`).
- [ ] **The AI service refuses to start without `SERVICE_API_KEY`**, and rejects the
      development default `dev-secret-key` whenever `APP_ENV` is not `development` or
      `test` ([config.py](../apps/ai-service/app/core/config.py)).
- [ ] **The worker refuses to start without `AI_SERVICE_API_KEY` and `WORKER_SERVICE_KEY`**
      ([index.ts](../worker/src/index.ts)).
- [ ] **Convex `/worker/*` endpoints reject unsigned calls**; the only accepted credential
      is a valid HMAC keyed by the Convex deployment env `WORKER_SERVICE_KEY`
      ([http.ts](../convex/http.ts)).
- [ ] **Quotas fail closed.** If the Convex quota call errors, the route returns 503 and
      does not start the expensive action ([quota.ts](../client/src/lib/server/quota.ts)).
- [ ] **Signed-request clock tolerance is 300 s.** Hosts that sign or verify must be
      NTP-synced; skew beyond five minutes produces 401s that look like a bad key.
- [ ] Every environment gets its **own** generated keys. Never reuse a dev key in
      staging or prod.

## 1. Components and ownership of state

| Component | Source | State it owns | Deploy artifact |
|---|---|---|---|
| Client (Next.js 16, Node runtime) | `client/` | SSR, 4 API routes, queue producer | Build output; **hosting target UNVERIFIED**, no platform config in repo |
| Convex backend | `convex/` | Source of truth: 8 tables, quotas, cron sweep, public functions, signed `/worker/*` HTTP actions | `npx convex deploy` |
| AI service (FastAPI) | `apps/ai-service/` | PDF extraction, embeddings → Qdrant, plan/report generation, realtime agent | `apps/ai-service/Dockerfile` |
| Worker (Node + BullMQ) | `worker/` | Two queues: `resume-processing`, `report-evaluation` | Root `Dockerfile` |
| Valkey/Redis | image | Queue persistence, retained failed jobs | Managed Redis/Valkey; `REDIS_URL` |
| Qdrant | image | Resume chunk vectors (768-d `nomic-embed-text`) | `QDRANT_URL` (+ optional `QDRANT_API_KEY`) |

`compose.yaml` is a **local development** artifact: it binds Qdrant, Valkey and the AI
service to `127.0.0.1` and assumes no TLS. Do not present it as a production topology.

## 2. Environment matrix

Set every value per environment. Blank `Required` means the service misbehaves or refuses
to start without it.

### Client (Next.js server + browser)

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | yes | Convex client URL; also read by `/api/stream/token` and `/api/stream/agent` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | yes | browser key |
| `CLERK_SECRET_KEY` | yes | server key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `_SIGN_UP_URL` | yes | must match real routes (`/sign-in`, `/sign-up`) |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` / `_SIGN_UP_URL` | yes | `/dashboard` |
| `REDIS_URL` | yes | queue producer for `/api/resume/process` and `/api/report/generate` |
| `AI_SERVICE_URL` | yes | `/api/stream/agent` target; defaults to `http://localhost:8000` if unset — always set it in prod |
| `AI_SERVICE_API_KEY` | yes | signing secret for `/api/stream/agent`; route returns 503 when unset |
| `STREAM_API_KEY`, `STREAM_API_SECRET` | yes for live interviews | `/api/stream/token`; server-only |
| `RESUME_FETCH_HOST` | conditional | only when the worker/AI service must rewrite a loopback storage URL (container dev). Leave unset when Convex is publicly reachable |
| `CONVEX_SITE_URL` | optional | informational; no client code reads it today |
| `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | optional | error monitoring is opt-in: with no DSN `Sentry.init` is never called. `SENTRY_AUTH_TOKEN` is unused (no source-map upload) |
| Stripe vars, `CLERK_WEBHOOK_SECRET`, `ADMIN_CLERK_IDS` | **do not configure** | documented in `.env.example` but no route reads them; `app/api/stripe/*` and `app/admin/billing` are empty directories |

### Convex deployment

| Variable | Required | Notes |
|---|---|---|
| `CLERK_JWT_ISSUER_DOMAIN` | yes | read by [auth.config.ts](../convex/auth.config.ts); must be the same Clerk instance the client uses |
| `WORKER_SERVICE_KEY` | yes | HMAC key for all six `/worker/*` actions; must equal the worker's value |

Set them on the deployment (dashboard preferred over shell history):

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<instance>.clerk.accounts.dev
npx convex env set WORKER_SERVICE_KEY <generated-32-byte-hex>
```

### Worker

| Variable | Required | Notes |
|---|---|---|
| `REDIS_URL` | yes | default `redis://localhost:6379` is dev-only |
| `CONVEX_SITE_URL` | yes | `https://<deployment>.convex.site` in production |
| `WORKER_SERVICE_KEY` | yes | must equal the Convex env value |
| `AI_SERVICE_URL` | yes | no trailing slash needed; normalised |
| `AI_SERVICE_API_KEY` | yes | must equal `SERVICE_API_KEY` in the AI service |
| `RESUME_QUEUE_NAME` / `REPORT_QUEUE_NAME` | optional | defaults `resume-processing` / `report-evaluation`; client must enqueue to the same names |
| `WORKER_CONCURRENCY` / `REPORT_WORKER_CONCURRENCY` | optional | defaults `2` / `1`; report runs are CPU-heavy |
| `AI_REQUEST_TIMEOUT_MS` / `REPORT_AI_REQUEST_TIMEOUT_MS` | optional | defaults `900000` (15 min) each |

### AI service

| Variable | Required | Notes |
|---|---|---|
| `SERVICE_API_KEY` | yes | generated per environment; the dev default is rejected outside `development`/`test` |
| `APP_ENV` | yes | set `production`; controls docs exposure, bare-key acceptance, default-key rejection |
| `CORS_ORIGINS` | yes | JSON list; set the real client origin, not `localhost` |
| `AI_PROVIDER` / `AI_FALLBACK_PROVIDER` | yes — set explicitly | config default is `gemini` while `.env.example` says `ollama`; do not rely on the default |
| `GEMINI_API_KEY` | yes for live interviews | Gemini Live needs it even when `AI_PROVIDER=ollama`; D-05 gates production use |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | as configured | must be reachable from the container/host |
| `QDRANT_URL`, `QDRANT_COLLECTION` | yes | collection must exist with vector size = `EMBEDDING_DIMENSION` (768) |
| `QDRANT_API_KEY` | if the cluster requires it | empty only for an unauthenticated local instance |
| `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSION`, `EMBEDDING_CONFIG_VERSION` | yes — keep in lockstep | changing any of them requires re-indexing; vectors from different models cannot be mixed |
| `STREAM_API_KEY`, `STREAM_API_SECRET` | yes for live interviews | same Stream app as the client |
| `REALTIME_MODEL`, `REALTIME_AGENT_USER_ID`, `REALTIME_MAX_RESUME_CHARS`, `REALTIME_MAX_QUESTIONS` | optional | defaults in `config.py` |
| `RESUME_MAX_BYTES` | optional | default 5 MB; the client's authoritative check is in Convex `saveResume`, keep them consistent |

## 3. Key consistency (the most common outage)

| Secret | Must match across | Rotation blast radius |
|---|---|---|
| `AI_SERVICE_API_KEY` (client, worker) = `SERVICE_API_KEY` (AI service) | 3 services | every plan/report/agent call returns 401 |
| `WORKER_SERVICE_KEY` (worker) = Convex env | 2 services | resume/report state stops updating; jobs retry then fail |
| Stream key/secret | client + AI service | live interview join fails |
| `CLERK_JWT_ISSUER_DOMAIN` (Convex) | the Clerk instance behind the client keys | every authenticated Convex call fails |

Generate with `openssl rand -hex 32`. Record the generation date and environment in the
secret manager; never paste values into this repository, chat, or logs.

## 4. Deploy order

Schema and machine-to-machine contracts are the compatibility surface. Deploy in this
order and verify each step before the next.

1. **Convex**
   - [ ] Set `CLERK_JWT_ISSUER_DOMAIN` and `WORKER_SERVICE_KEY`.
   - [ ] `npx convex deploy`.
   - [ ] Confirm the schema is additive: `rateLimits` table with `by_key`, plus `by_status`
         on `resumes` and `reportJobs`. Removing/renaming a field is not allowed in this
         deploy (A7).
   - [ ] Confirm the cron `sweep stale jobs` exists (every 10 minutes).
   - [ ] `curl -i -X POST https://<deployment>.convex.site/worker/report-start` → `401`.

2. **AI service**
   - [ ] Build with `INSTALL_REALTIME=true` when live interviews are enabled; the
         Dockerfile default is `false` and `compose.yaml` defaults it to `true`.
   - [ ] `curl -fsS http://<host>:8000/health` → `{"status":"healthy",...}`.
   - [ ] Unsigned POST to any `/v1/...` route → `401 Signed service request required`.
   - [ ] A signed request from the worker succeeds (watch the first real job).
   - [ ] Confirm `/docs` is absent (`APP_ENV=production`).

3. **Worker**
   - [ ] `cd worker && bun install --frozen-lockfile && bun run build`.
   - [ ] Start with the production env; logs must show `worker ready` and
         `report worker ready`, then a `worker heartbeat` every 60 s.
   - [ ] If the old worker is draining, keep it running until queue depth is 0.

4. **Client**
   - [ ] `cd client && bun install --frozen-lockfile && bun run build`.
   - [ ] Deploy the build to the chosen host (target UNVERIFIED; no platform config).
   - [ ] Confirm the route table contains only the four API routes: `report/generate`,
         `resume/process`, `stream/agent`, `stream/token`. An `/api/ai` route means a stale
         build.

When a contract changes, deploy **worker and AI service before the client**, and keep the
previous worker until the queue drains.

## 5. Post-deploy smoke tests

Run against staging first with a throwaway account. Each item states the expected result;
a pass is the observed result, not the intention.

### Auth and routing
- [ ] Signed out, `/dashboard` and `/interview/*` redirect to sign-in (middleware matcher
      in [proxy.ts](../client/src/proxy.ts)).
- [ ] Signed in, dashboard loads and `users` row exists with `clerkId` from the JWT.
- [ ] `/reports` never shows another user's rows (Convex queries are identity-scoped).

### Security headers
- [ ] `curl -I https://<client-host>/` returns `Strict-Transport-Security`,
      `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`,
      `Permissions-Policy` with `camera=(self)`/`microphone=(self)`, and a CSP containing
      `frame-ancestors 'none'` ([next.config.ts](../client/next.config.ts)).
- [ ] The same headers are present on a `307` redirect and on a `401` API response.
- [ ] After signing in, camera and microphone prompts still work in the lobby — the
      Permissions-Policy must not block the core interview flow.

### Error monitoring
- [ ] With `NEXT_PUBLIC_SENTRY_DSN` unset, the app starts and the browser makes no
      request to a `sentry`/`ingest` host (network tab).
- [ ] With the DSN set, force one server error and confirm exactly one event arrives with
      the expected `environment` (`NEXT_PUBLIC_SENTRY_ENVIRONMENT` or `NODE_ENV`).
- [ ] Confirm the event carries no transcript, resume text, or uploaded file content.

### Interview create + quota
- [ ] Create an interview → row appears; opening it shows the lobby.
- [ ] Creating an 11th interview in one hour returns the quota message
      (`interview_create`, limit 10/h in [rateLimits.ts](../convex/rateLimits.ts)).
- [ ] A `resumeId` owned by another user is rejected with `Not found`.

### Resume pipeline
- [ ] Upload a non-PDF → rejected before any queue work.
- [ ] Upload a >5 MB PDF → rejected; `saveResume` compares against stored metadata.
- [ ] Valid PDF → status moves `processing` → `complete`; plan has 5–7 questions.
- [ ] Retrieval returns chunks filtered by the owner and that resume (Qdrant
      `metadata.user_id` + `metadata.resume_id`).
- [ ] A 7th resume process within the hour returns `429` with `Retry-After`
      (`resume_process`, limit 6/h).

### Report pipeline
- [ ] Complete a short interview, enqueue a report, watch `reportJobs` move
      `queued` → `processing` → `complete`.
- [ ] Per-question scores are 0–10 or `null` for not-evaluable answers; evidence quotes are
      verbatim from the transcript.
- [ ] An 11th report request within the hour returns `429` and the job is marked failed
      with the rate-limit reason (`report_generate`, limit 10/h).
- [ ] Not a pass/fail gate today: rejecting a report whose scores do not match the
      answers is G-20 acceptance and is **not implemented** in this tree. Track it in §9
      and do not sign this checklist on the assumption that it runs.

### Live interview
- [ ] `/api/stream/token` returns a token for the signed-in participant.
- [ ] Agent dispatch succeeds once; a 21st dispatch within the hour returns `429`
      (`stream_agent`, limit 20/h).
- [ ] Captions append to the transcript; a dropped agent leaves existing answers intact.

### Failure and recovery
- [ ] Kill the worker mid-job. The job is retried; on terminal failure the Convex state is
      reported exactly once and the UI shows failure, not silence.
- [ ] Backdate a `reportJobs` row to `queued` older than 15 minutes (or `processing` older
      than 45) and wait one sweep: it becomes `failed` with `job_timeout`.
      Resumes stuck in `processing` older than 60 minutes are failed the same way.
- [ ] `cd worker && bun run requeue --queue report --job <id>` re-enters the job and the
      handler stays idempotent (no duplicate visible turn, no double completion).

## 6. Operations runbook

| Situation | Action |
|---|---|
| User is rate limited and it is legitimate | Wait for the fixed window (`retryAfterMs` in the response); there is no admin bypass today. Resetting a window means editing/deleting the `rateLimits` row in the Convex dashboard — treat as a data mutation. |
| Job stuck, worker healthy | Wait one sweep cycle; then use `bun run requeue --queue resume|report --job <id>`. |
| Burst of failures after a key change | Compare `AI_SERVICE_API_KEY` on client+worker with `SERVICE_API_KEY`, and `WORKER_SERVICE_KEY` on worker with the Convex env. 401s on every call usually mean one mismatch. |
| Intermittent 401 with correct keys | Check host clock skew (300 s tolerance). |
| Queue backing up | Inspect depth in Redis; raise concurrency only within the AI service's capacity. Report concurrency is 1 by default because runs are CPU-heavy. |
| Provider outage | Bounded BullMQ retries apply (resume 3×, report 2×); check `AI_FALLBACK_PROVIDER`. |

Key rotation order (no downtime is guaranteed; keep the window short):
1. `AI_SERVICE_API_KEY`: update the AI service, then client and worker, then restart both.
2. `WORKER_SERVICE_KEY`: update Convex env, then the worker, then restart.

## 7. Rollback

- **Client:** redeploy the previous build. It will keep working against the current
  Convex schema as long as the schema change was additive.
- **Worker:** redeploy the previous image after the queue drains; both versions must be
  able to read the retained jobs.
- **AI service:** redeploy the previous image; verify the signing contract before rolling
  the client back.
- **Convex:** forward-fix only — function binaries are not versioned. Keep the additive
  schema; do not drop `rateLimits`, `by_status` indexes, or the sweep cron to "roll back".
  Convex backup/restore availability is **UNVERIFIED**; confirm before touching deletion
  paths.
- **Data:** no destructive migration is part of this release. If one becomes necessary,
  snapshot first and get explicit approval (AGENTS.md autonomy boundary).

## 8. Verification commands and current baselines

Run these from the repo before declaring the deploy ready. Fix regressions in code you
touched; do not "fix" the baselines below inside a deploy run.

```bash
cd client && bun run test                 # vitest
cd client && bunx tsc --noEmit
cd client && bun run build
cd client && bunx tsc -p ../convex/tsconfig.json --noEmit --typeRoots ./node_modules/@types
cd worker && bun test && bun run typecheck && bun run build
cd apps/ai-service && uv run pytest
```

Last verified 2026-10-31: client vitest **250 passed / 0 failed** (23 files), worker **24
passed**, AI service pytest **133 passed / 1 skipped** (integration test skipped without
local Qdrant/Ollama), Convex typecheck **0** with `--typeRoots`, client typecheck and build
**0**, worker typecheck/build **0**. `ruff` now loads: the invalid `QTY`/`TT`/`IF` selectors
were replaced and the settings moved under `[tool.ruff.lint]`; it still reports **790
pre-existing findings** (top: `S101` asserts in tests, `D1xx` docstring coverage,
`PLR2004`, `TRY003`) that are lint debt, not test failures. Raw
`tsc -p convex/tsconfig.json` without `--typeRoots` fails on missing Node types in
untouched files — use the full command above.

## 9. Open blockers before public launch

These are not checklist steps; they are honest gates that remain open in this tree.

| Item | Evidence | Blocks public launch? |
|---|---|---|
| G-42 security headers | **baseline implemented 2026-10-31**: HSTS, nosniff, frame-deny, referrer, permissions policy, minimal CSP in `client/next.config.ts`; a full origin-scoped CSP (Clerk/Convex/Stream/Sentry hosts) is still deferred | no for launch review; yes for the CSP follow-up |
| G-05 CI | **added 2026-10-31**: `.github/workflows/ci.yml` runs the green gates (client tests/typecheck/build + Convex typecheck, worker tests/build, pytest); lint is not gated because of the ~790 findings | no; branch protection still needs manual setup |
| G-02 error monitoring | **implemented 2026-10-31**: server and browser instrumentation init only when a DSN is configured; replays, tracing and PII are off. Delivery to a real project is UNVERIFIED (no DSN available here) | no for code; yes until a DSN is configured and one event is observed |
| G-25 red tests | **resolved 2026-10-31**: assertions updated to the redesigned lobby and job-description copy; 250/250 client tests pass | no |
| G-47 ruff config | **config crash fixed 2026-10-31** (invalid selectors removed, `lint` section); 790 pre-existing lint findings remain as separate debt | no for deploy; yes for a lint gate |
| G-20 report evidence | see the issue register | yes before calling reports trustworthy |
| D-01 / D-02 | consent and retention decisions undefined | yes, legal/product |
| D-05 | Gemini in production requires a data-handling decision | yes if Gemini is used for prod inference |
| Storage-level ownership | a raw `storageId` is not proven to belong to the caller (residual of G-41) | review before public uploads |
| Stripe/admin scaffolding | empty route dirs; envs documented but unused | no — but do not advertise billing, and consider deleting the scaffolding |
| `docs/status.md` drift | says 6 tables, `X-Worker-Key`, and `scripts/verify-agents.sh` (missing); actual: 8 tables, HMAC headers, 4 API routes | no, but update before the deploy run |

## 10. Sign-off

| Gate | Evidence (command output / screenshot / link) | Owner | Date |
|---|---|---|---|
| Convex deployed, cron visible, `/worker/*` returns 401 | | | |
| AI service health + signed-request smoke | | | |
| Worker ready + heartbeat + both queues consumed | | | |
| Client build + route table + auth redirects | | | |
| Smoke tests §5 complete | | | |
| Rollback steps rehearsed on staging | | | |
| §9 blockers accepted or closed | | | |
