# Production Readiness Plan — Interview AI

> Status: **draft, awaiting approval**. Planning only; no application code was changed.
> Date: 2026-10-28. Evidence rules: every claim cites a file, a command, or is marked
> `UNVERIFIED` / `ESTIMATE`. Rules live in [AGENTS.md](../../AGENTS.md); verified facts in
> [status.md](../status.md); system shape in [architecture.md](../architecture.md).

## 0. Approval gate

| Phase | Scope | Code allowed |
|---|---|---|
| Plan (this document) | audit, roadmap, decisions | **no** |
| Phase 0 — identity and trust boundaries | G-01, G-22, G-38, G-24, G-21, G-30 | only after explicit approval |
| Phase 1 — data integrity | G-23, G-32, G-33, G-44, G-09, G-43, G-07 | separate approval |
| Phase 2 — session durability | G-13, G-17, G-34, G-35, G-36, G-37, G-26, G-14, G-15 | separate approval |
| Phase 3 — report correctness | G-20, G-40 | separate approval |
| Phase 4 — observability, CI, cost | G-02, G-19, G-05, G-25, G-47 | separate approval |
| Phase 5 — hardening and design | G-06, G-42, G-39, G-28, G-04, G-08, G-12, G-49 | separate approval |

Approving one phase does not authorize the next. Every phase ends with the gates named in
§11 and a report in the format defined in `status.md`.

### Deliverable coverage

| Master-prompt deliverable | Section | Complete? |
|---|---|---|
| 1 Executive summary | §1 | yes |
| 2 Architecture map | §2 | yes (pointer + call inventory) |
| 3 Feature audit | §3 | yes |
| 4 User journey audit | §4 | yes |
| 5 Prioritized issue register | §5 | yes (register in AGENTS.md) |
| 6 Performance baseline | §6 | partial — build measured, runtime `UNVERIFIED` |
| 7 AI cost audit | §7 | partial — inventory done, cost `UNVERIFIED` (no token logging) |
| 8 Reliability plan | §8 | yes |
| 9 Security and privacy audit | §9 | yes, legal items flagged |
| 10 Testing strategy | §10 | yes |
| 11 Implementation roadmap | §11 | yes |
| 12 Deployment plan | §12 | yes, staging design proposed |
| 13 Decision register | §13 | yes — 9 decisions need you |
| 14 Definition of done | §14 | yes |

---

## 1. Executive summary

**What exists.** Next.js 16.4 client, Convex (6 tables), BullMQ worker over Valkey, FastAPI
AI service over Qdrant, Clerk auth, Stream video with a Gemini Live interviewer. Résumé
parsing and report generation are genuinely asynchronous: queues, durable job state,
terminal-failure callbacks, and validated worker contracts already exist. That is the
right skeleton and it should be kept.

**Current verdict: no-go for production.** Release gate: **1 of 11 satisfied**. The one
passing item is the documentation drift script. Everything else fails:

1. **Identity is forgeable.** `syncUser` is a public mutation that trusts `clerkId` and
   `email` from the caller (`convex/users.ts:5-38`). G-01, Blocker.
2. **A default service key ships in config.** `dev-secret-key` appears in `config.py:36`
   and `compose.yaml`, and comparison is `!=` (`deps.py:11`). G-22, High.
3. **Uploads are declared, not validated.** No `%PDF-` check; 5 MB limit is client-side.
   G-24, High.
4. **Clients can write derived state.** `updateInterviewStatus`, `saveReport` and
   `markResumeStatus` are callable with arbitrary values (G-23, G-32, G-33, G-44).
5. **The transcript is not durable.** Reload loses the in-memory reducer, caption updates
   are not persisted, question text can freeze as `"Interview question"`, and turn saves
   have no retry (G-17, G-34, G-35, G-36).
6. **The report is not fully evidence-based.** Coverage can be short (G-20), there is no
   quote per score (`convex/schema.ts:68-72`), and the overall score is whatever the model
   returns (`worker/src/report-processor.ts:167`), not derived from per-answer scores.
7. **Nothing is observed.** No `Sentry.init` (G-02), no latency fields (G-19), no CI
   (G-05), no rate limits (G-06), no security headers (G-42).

**What is strongest and should not be rewritten.** The queue boundaries, the report-job
state table, the worker HTTP contract, the device-preview lobby (permission handling,
device selection, live mic meter), and the closed-caption ingestion path.

**Value order.** Close the identity and trust-boundary holes first, then make the
transcript and report truthful, then make failure visible. Design work stays last because
the product cannot responsibly invite users before the first two are done.

---

## 2. Architecture map

Full map: [architecture.md](../architecture.md). Summary of the as-built path:

```
Clerk → Convex (users/interviews/answers/resumes/reports/reportJobs)
Browser → Next /api/{ai,resume,report,stream} → FastAPI → Gemini/Ollama + Qdrant
Next → BullMQ (Valkey) → worker → /worker/* (X-Worker-Key) → Convex
Stream call ← browser + Gemini Live agent (joined once at /api/stream/agent)
```

External calls per completed interview, verified by reading the route handlers:

| Call | Where | Sync? | Notes |
|---|---|---|---|
| Résumé chunk + embed | worker → `v1/resumes` | queued | one batch per résumé |
| Question plan | Next proxy → `v1/interviews/plan` | request | 900 s upstream timeout |
| Realtime audio | Stream ↔ Gemini Live | continuous | largest cost and latency risk |
| Report evaluation | worker → `v1/interviews/evaluate` | queued | one call per report |

No other provider calls exist. There is no per-turn retrieval (G-16), so no retrieval cost
during a live session.

---

## 3. Feature audit

Statuses: **working**, **unreliable**, **partial**, **missing**, **unverified**.

| Feature | Status | Evidence |
|---|---|---|
| Clerk sign-in/up | working | `client/src/app/(auth)/**`; no MFA or session policy review done |
| Landing page reachable | **missing** | `UserSyncProvider` redirects every signed-out visitor, `/` included (G-21) |
| Résumé upload UI | working | `ResumeUpload.tsx` validates type/size, shows progress with a stable toast id |
| Résumé byte validation | **missing** | no `%PDF-` check outside tests (G-24) |
| Résumé processing | working | `resume-processing` queue, 3 attempts, `/worker/resume-complete|failed` |
| Résumé replacement safety | unreliable | prior blob deleted while a job may hold its URL (G-31) |
| Résumé deletion | partial | row + blob removed, Qdrant vectors retained (G-09) |
| Interview setup | partial | résumé required, JD min 50 chars (G-14); contradicts F5 |
| Question plan | working | 5–7 questions (`prompts/interview.py:10`), stored as `v.any()` (G-07) |
| Status transitions | **unreliable** | client-callable, no transition table (G-23) |
| Lobby device checks | working | `device-preview.tsx` permission errors, device pickers, mic meter; `canStart` gates on it |
| Lobby readiness source | unreliable | reads latest résumé, not the interview's (G-15) |
| Lobby state source | reliable | Convex queries; no local assertion except the status mutation |
| Live agent dispatch | partial | fire-and-forget, 15 s route timeout, no state row, no retry (G-13) |
| Live grounding | partial | built once at join; no mid-call retrieval (G-16) |
| Conversational state UI | **missing** | room shows only "Live" and participant count (G-49) |
| Transcript capture | unreliable | dedupe works; reload/update/retry gaps (G-34, G-35, G-36) |
| Question attribution | unreliable | freezes as `"Interview question"`; `followUpCount` always 0 (G-17) |
| End interview | partial | persists `completed` with no transition check; leave control ends it (G-23, G-49) |
| Session expiry | **missing** | no server-owned deadline or reaper (G-37); token expires at 3600 s (G-26) |
| Report generation | working | queue + job state + validation; partial report possible (G-20) |
| Report evidence | **missing** | no quote field; overall score not derived (G-20) |
| Report retry | working | explicit Retry after failure (`report/page.tsx:146`) |
| Billing | **missing** | empty Stripe dirs, no plan fields (G-03) |
| Error monitoring | **missing** | no `Sentry.init` (G-02) |
| CI | **missing** | no `.github/` (G-05) |
| Rate limiting / headers | **missing** | none (G-06, G-42) |

---

## 4. User journey audit

### A. Setup

| Step | As built | Gap |
|---|---|---|
| Upload résumé | optional in UI? No — setup validation requires `resumeId` (`validation.ts:7`) | F5 requires résumé-optional (G-14) |
| Job description | min 50 chars (`validation.ts:10`, `worker/src/job.ts:20`) | brief JD rejected at four layers (G-14) |
| Parse résumé | queued; lobby shows 4-step checklist | checklist keyed to latest résumé, not this interview (G-15) |
| Plan generation | AI plan 5–7 questions | untyped storage (G-07) |
| Failure recovery | toasts exist; setup fires success after a swallowed enqueue failure | G-18 |
| Empty/loading/error states | present for interview and lobby queries | no empty state for "no résumé yet" |

### B. Microphone and camera checks

Implemented, and this is the healthiest part of the frontend.

- Permission denied, missing `getUserMedia` and unsupported browser are handled with
  specific copy (`device-preview.tsx:182-205`).
- Device enumeration after permission grant, camera and mic pickers, live mic meter
  (`:234-258`, `:394`).
- Start is disabled until device preview reports ready (`interview-lobby.tsx:131`).

Gaps against the master prompt:

1. **No explicit consent step.** The only consent text is the generic sign-up line
   (`sign-up/page.tsx:76`). There is no "this session is recorded/processed by an AI
   provider" notice before the call starts. Jurisdiction-dependent — see D-01.
2. **No `devicechange` or track-ended listener.** Unplugging a camera mid-lobby is not
   detected; there are zero matches for `devicechange` in the lobby.
3. **Connectivity is inferred, not tested.** The lobby only checks that `/api/stream/token`
   returns OK; it never joins the call before Start.
4. **Device choice is not carried into the room.** Lobby selection is local to the preview;
   the room's `CallControls` and the SDK pick their own devices. `UNVERIFIED` whether the
   browser preserves the selection via permission defaults.

### C. Real-time interview

| Requirement | As built | Gap |
|---|---|---|
| Show state (preparing/listening/processing/responding/reconnecting) | only "Live" + participant count | G-49 |
| Handle interruptions / silence / STT errors | delegated to Gemini Live | no UI or recovery copy |
| Prevent duplicate questions/answers | dedupe on `speaker|start_time`; upsert on `(interviewId, questionIndex)` | reload and re-delivery gaps (G-34, G-35) |
| Reconnect | Stream SDK reconnect, but no explicit handling; dispatch is one-shot | G-13 |
| End intentionally | "End Interview" and the leave button both call `onFinish` | no confirmation; accidental ends (G-49) |
| Accidental disconnect | closing the tab leaves the interview `in_progress` | G-37 |
| Persist progress | answers persist per turn, but only from captions | G-17 |

### D. Report

| Requirement | As built | Gap |
|---|---|---|
| Structured report | overall, strengths, weaknesses, recommendations, per-question feedback | — |
| Evidence and quotes | none stored | G-20 |
| Score transparency | model returns `overall_score`; UI shows a ring and color only | no stated formula, no criteria (G-20) |
| Distinguish evidence from interpretation | not represented in schema | same gap |
| Failure handling | `failed` job state, explicit Retry button | retry is user-initiated only, as designed |
| Retrieval later | `/reports` and `/interview/[id]/report` read from Convex | `/reports` is not middleware-protected (G-30) |

---

## 5. Prioritized issue register

The authoritative register is [AGENTS.md](../../AGENTS.md) (47 rows; G-11 retired), with
file:line evidence in [status.md](../status.md). New rows produced by this audit:

| ID | Priority | Finding | Rule | File |
|---|---|---|---|---|
| G-20 (expanded) | High | Coverage can be short; no quote per score; overall score is model-asserted instead of derived from per-answer scores | F8 | `worker/src/report-processor.ts:167`, `convex/schema.ts:68-72` |
| G-49 | Medium | Room has no preparing/listening/responding/reconnecting state; leave control ends the interview without confirmation | D8 | `interview-room.tsx:117` |

Mapping to the master prompt's scale: Blocker = P0, High = P1, Medium = P2, cosmetic =
P3. 1 Blocker, 32 High, 14 Medium as of this plan.

Root causes worth naming because they explain several rows at once:

1. **Client-asserted state.** The UI writes status, reports and résumé state because those
   mutations are public. One refactor (internal mutations + transition table) closes
   G-23, G-32, G-33 and G-44.
2. **No server session owner.** The call lifetime lives in the browser and an in-memory
   Python dict, so reload, tab close, token expiry and agent failure have no authoritative
   record (G-13, G-26, G-34, G-37).
3. **No measurement layer.** Without timing, token counts and error events, latency and
   cost targets cannot be set honestly (G-02, G-19).

---

## 6. Performance baseline

Measured 2026-10-28 on this machine:

| Metric | Value | Command |
|---|---|---|
| Client build | exit 0, 16 routes | `cd client && bun run build` |
| Static payload (raw, all chunks) | **2.4 MB** | `du -sh client/.next/static` |
| Largest chunk (raw) | **629 KB** | `find .next/static -name '*.js' -printf ...` |
| gzip / per-route First Load JS | not emitted by this Next 16.4 build | — |
| Runtime latency (join, first turn, turn, report) | **UNVERIFIED** — no instrumentation | Q9 = 0 hits |

Budgets to hold (from F9): dispatch ≤ 1.5 s, audible ≤ 5 s, turn ≤ 2.5 s, caption→row ≤ 2 s,
report enqueue ≤ 0.5 s, queued→processing ≤ 10 s, text model call ≤ 120 s.

Measurement plan (Phase 4): one timing record per interview (`joinedAt`, `agentAudibleAt`,
`turnLatency[]`, `reportEnqueuedAt`, `reportStartedAt`) plus a derived p50/p95 once ≥ 100
sessions exist. Until then, any p95 claim is unverifiable. Bundle target: set after gzip
measurement; do not invent one now.

---

## 7. AI cost audit

Call inventory per completed interview (verified by reading handlers):

| Call | Model | Count | Cost driver |
|---|---|---|---|
| Chunk + embed résumé | `EMBEDDING_MODEL` (default nomic-embed-text, local Ollama) | 1 batch | compute, no API fee locally |
| Plan | `AI_PROVIDER` (default Ollama; Gemini optional) | 1 | tokens, or local compute |
| Realtime speech-to-speech | `REALTIME_MODEL` (Gemini Live) | continuous for the session | **dominant**: audio minutes, not tokens |
| Evaluate | `AI_PROVIDER` | 1 | tokens |
| Retries | provider/queue/dispatch | 0–3 | duplicates up to bounded retry counts |

**Finding: there is no token or duration accounting anywhere.** No logger records model,
prompt tokens, completion tokens, audio seconds or call duration; `Q9` and cost fields are
absent. A per-interview figure would be a guess, so none is given.

Measurement plan: emit one structured event per model call (`provider`, `model`,
`operation`, `promptTokens`, `completionTokens`, `audioSeconds`, `durationMs`,
`interviewId`), aggregate per session, then price it with the provider's current rate card.
Until that exists, cost targets are `UNVERIFIED` and the only honest control is structural:
bounded retries already exist, retrieval is absent (so no retrieval spend), and the plan
prompt is short.

Optimization candidates, contingent on measurement: keep local embeddings, cap plan/evaluate
prompt size (résumé excerpt already capped at 6 000 chars at join), reuse the stored plan
instead of regenerating, and never retry malformed provider output.

---

## 8. Reliability plan

Failure matrix. Detection must be server-side; a toast alone is not detection.

| Failure | Detection today | Retry today | Fallback | User sees | Target |
|---|---|---|---|---|---|
| Provider down | 502/504 from proxy | provider-level only | `AI_FALLBACK_PROVIDER` | generic failure | bounded retry + specific copy |
| Model timeout | 900 s abort | none | none | 504 | explicit per-call timeout (G-29), budget 120 s |
| Agent dispatch fails | fetch rejects | none | none | warning toast | 3 attempts, then `realtimeSessions.failed` + Rejoin (G-13) |
| Agent dies mid-call | **none** | none | none | silence | heartbeat + Rejoin (G-13) |
| Captions stop | **none** | none | none | partial transcript | detect gap, banner, keep local buffer (G-36) |
| Tab close | none | none | none | interview stuck `in_progress` | server deadline closes it (G-37) |
| Token expiry | join error | none | none | reconnect fails | mint for duration + 10 min (G-26) |
| Worker crash | BullMQ | 3× résumé, 2× report | terminal callback | job failed | keep; add DLQ visibility (G-19) |
| Report partial | none | none | none | short report | reject when scores ≠ answers (G-20) |
| Duplicate save | upsert | — | — | — | keep; add idempotency key (W9) |

Rules that must hold after Phase 2: terminal failure is reported to Convex exactly once, a
retry that succeeds clears the error state, and no retry can duplicate a visible turn.

---

## 9. Security and privacy audit

| Area | Status | Finding |
|---|---|---|
| Identity | **critical** | G-01: identity accepted from the caller |
| Service auth | **high** | G-22 default key, `!=` compare; G-38 worker key `===` |
| Authorization | partial | Convex ownership checks exist for reads; G-41 lacks `resumeId` ownership in `createInterview` |
| Route protection | partial | G-21 landing blocked, G-30 `/reports` client-guarded |
| Upload validation | **high** | G-24; no malware scan (out of scope until storage is public-facing) |
| Injection / XSS | no finding | React escaping; Convex validators on writes; no `dangerouslySetInnerHTML` found |
| CSRF | not applicable yet | cookie-based Clerk + same-origin API routes; revisit when webhooks are added |
| SSRF | **high** | G-22's public AI-service base URL escape hatch; worker fetches a Convex URL only |
| Secrets | **high** | `dev-secret-key` default; `.env*` files are untracked (verified) |
| Transport / at rest | unverified | TLS assumed at the platform layer; encryption at rest is provider-managed and **UNVERIFIED** |
| Retention | **missing** | no deletion of interviews (G-43), no account deletion, transcripts kept indefinitely |
| Consent | **missing** | no recording/AI-processing consent before the session (D-01) |
| Third-party AI handling | **unverified** | no documented data policy for Gemini/Ollama inputs (D-05) |
| Dependencies | unverified | no audit run; `bun audit` not part of any gate |
| Compliance claims | none made | legal review required before any claim (GDPR/DPA) — D-02 |

Prompt-injection posture (S5): résumé text, JD and answers are delimited in prompts and the
realtime instruction container has an untrusted-data note, but there is no test proving
that embedded instructions are ignored. Add to Phase 2 acceptance.

---

## 10. Testing strategy

Current inventory (measured 2026-10-28):

| Layer | Files | Cases | State |
|---|---|---|---|
| Client unit/component | 19 | ~163 | 6 failing (G-25) |
| Worker | — | 11 | passing |
| AI service | 9 (8 unit + 1 integration) | 72 | 71 pass, 1 skip |
| Convex | 1 file inside client | included above | no `convex/tests` |
| End-to-end / flows | 0 | 0 | **missing** (Q8) |
| Browser (mic/camera) | 0 | 0 | **missing** |
| Load / concurrency | 0 | 0 | **missing** |

Priority tests to add, mapped to rules:

1. **Authorization** (T1): cross-account for interviews, résumés, reports, and `syncUser`
   spoofing. Current file covers interviews only.
2. **Transitions** (T2, T14): every illegal transition rejected.
3. **Transcript exactly-once** (T10, T20): replay a caption and reload the room.
4. **Report coverage and evidence** (T11): N answers → N scores, each with a quote;
   partial model output fails.
5. **Upload validation** (T5, T15): wrong MIME, forged `.pdf`, 6 MB, server-side.
6. **Dispatch failure** (T12): three failures → one failed row → Rejoin.
7. **Session end** (T21): expiry closes the row and stops the agent; tab close does not
   leave `in_progress`.
8. **Route protection** (T16): signed out, only `/` and `/sign-in` render.
9. **Rate limits** (S13): per-user bucket on AI proxy and enqueue routes.
10. **Accessibility** (T-aria): one `h1`, focus order, labels, 390px viewport.

Tooling: Vitest for unit/component (already used), Playwright for browser and
mic-permission flows (not installed — a dependency decision, D-08), a fake Gemini Live
agent for integration, and k6 or autocannon for load. Deterministic tests use mocked
providers; live-provider tests are opt-in via the `integration` marker that already exists.

Release criteria: all gates in `docs/status.md` at or above baseline, no failing test in a
passing suite, and the release gate in AGENTS.md fully checked.

---

## 11. Implementation roadmap

Effort is an `ESTIMATE` (S < 1 day, M 1–3, L 4–7) and assumes one engineer who knows the
codebase.

### Phase 0 — identity and trust boundaries (Blocker)

| Item | Change | Files | Acceptance |
|---|---|---|---|
| G-01 | Derive identity from `ctx.auth`; drop `clerkId`/`email` args; delete dead `SyncUser.tsx` | `convex/users.ts`, `UserSyncProvider.tsx` | a caller cannot write another `clerkId`; T1 passes |
| G-22, S15 | Require `SERVICE_API_KEY` at startup; `secrets.compare_digest`; remove public base-URL escape | `config.py`, `deps.py`, `lib/ai-service.ts` | Q12 = 0; service refuses to start without a key |
| G-38, S8 | Constant-time worker key compare | `convex/http.ts:11-15` | wrong key → 401; timing-safe helper |
| G-24, S14 | Validate `%PDF-` and real byte length before parse/index | `convex/resume.ts`, upload route | forged PDF rejected; 6 MB rejected server-side |
| G-21, G-30, S16 | Declarative route list; landing public | `client/src/proxy.ts`, `layout.tsx`, `UserSyncProvider.tsx` | signed out: `/` and `/sign-in` render, others redirect |

Effort: M. Dependencies: none. Risk: `UserSyncProvider` is on every page; test all three
surfaces after the change.

### Phase 1 — data integrity (High)

G-23 transition table, G-32/G-33/G-44 internal writers, G-09/G-43 cascade deletion
(blob + row + vectors + jobs), G-07 typed plan. Acceptance: T2/T14/T19 pass; after deleting
a résumé or interview, zero Qdrant vectors and zero queued jobs reference it; no client can
write `ready`/`completed`/report rows. Effort: M.

### Phase 2 — session durability (High)

G-13 `realtimeSessions` + 3-attempt dispatch + Rejoin; G-17/G-34/G-35/G-36 transcript
hydration, latest-text persistence and bounded turn retries; G-37 server deadline and
reaper; G-26 token lifetime; G-14/G-15 résumé-optional and correct-résumé readiness;
G-49 room states and leave confirmation. Acceptance: a 30-minute session survives reload,
caption re-delivery, agent failure and tab close with a complete report; T10/T12/T20/T21
and Q8 pass. Effort: L. Depends on Phase 1 (transition table).

### Phase 3 — report correctness (High)

Enforce coverage, store a quote per score, derive the overall score from per-answer scores
with a stated formula, and render stable error codes. Acceptance: T11 and T23 pass; report
UI shows the quote and the formula. Effort: M. Depends on Phase 2 (durable answers).

### Phase 4 — observability, CI, cost (Medium)

Sentry init and `instrumentation.ts` (G-02); latency fields (G-19); CI for Q1–Q4, Q10, Q11,
Q13 (G-05); fix the 6 red client tests (G-25); fix ruff config (G-47); model-call cost
events. Acceptance: an induced error produces exactly one event; Q9 has data for every F9
row; CI is green on a PR; a cost-per-interview number can be computed from logs. Effort: M.

### Phase 5 — hardening and design (Medium)

Rate limits (G-06), security headers (G-42), worker config fail-closed (G-39), dead code
(G-28, G-03), pagination (G-45), structured AI-service logs (G-46), design-system migration
(G-04, G-08, G-12) with ADR 0002. Effort: M–L. Depends on Phases 0–4.

---

## 12. Deployment plan

**Today:** no CI, no staging, no feature flags, no rollback procedure. Containers exist for
the AI service and the root stack (`Dockerfile`, `apps/ai-service/Dockerfile`,
`compose.yaml`); the client's production host is **UNVERIFIED** (no platform config in the
repo).

Proposed target:

1. **Environments.** `dev` (local compose + Convex dev deployment), `staging` (separate
   Convex deployment, separate Stream app, Clerk dev instance), `prod` (Clerk production,
   separate Convex prod deployment, Stream prod app). Never share a Convex deployment
   between staging and prod.
2. **Config.** Every variable from `architecture.md` §8 set per environment; `SERVICE_API_KEY`
   generated per environment; no default is accepted at boot.
3. **Migrations.** Convex schema changes are additive first (A7). Deploy schema → deploy
   functions → deploy client. A breaking rename requires a backfill job and an ADR.
4. **Rollout.** Deploy worker and AI service before the client when contracts change; keep
   the previous worker running until the queue drains. Use env-gated flags for Phase 2/3
   behaviour if a partial rollout is needed; no flag framework exists today.
5. **Rollback.** Client: redeploy the previous build. Functions: forward-fix (Convex does
   not version function binaries); keep the additive schema so old functions still run.
   Data: Convex backup/snapshot availability is **UNVERIFIED** — confirm before Phase 1
   touches deletion paths.
6. **Verification after deploy.** Health checks for AI service and worker, a synthetic
   interview with a fake agent, one real session, Q12 and the release-gate items that can
   run against staging.
7. **Monitoring.** Correlation id per interview, propagated to worker and AI service;
   alerts on dispatch failure rate, caption gap rate, report failure rate, provider 5xx,
   queue depth and p95 turn latency.

---

## 13. Decision register

| ID | Decision | Options | Recommendation | Needs |
|---|---|---|---|---|
| D-01 | Recording/AI-processing consent | (a) explicit checkbox before Start, (b) banner only, (c) none | (a) | product + legal |
| D-02 | Retention policy per artefact | keep forever / 30/90 days / user-deletes | define per artefact, then implement deletion with G-43 | legal |
| D-03 | Load target `N` | 10 / 25 / 100 concurrent sessions | measure first; propose 25 as the first target | you |
| D-04 | Cost budget per interview | no ceiling / soft alert / hard cap | soft alert after instrumentation | you |
| D-05 | Provider data handling | Ollama-only for prod / Gemini allowed | confirm DPA and data region before Gemini in prod | you + legal |
| D-06 | Overall score formula | mean of per-answer scores / weighted by question importance | simple mean, rounded, stated in UI | you |
| D-07 | Staging topology | separate Convex deployment / shared dev | separate deployment | you |
| D-08 | Browser-test tool | Playwright / none | Playwright for mic-permission and reconnect flows | you (new dependency) |
| D-09 | Design token promotion | promote to `:root` / keep scoped | ADR 0002, promote with G-08 | you |

---

## 14. Definition of done

A phase is done when:

1. Its acceptance item in §11 is demonstrated (command output, test name, or screenshot),
   not asserted.
2. Gates that passed at baseline still pass, and failing gates did not get worse
   (`docs/status.md`).
3. `bash scripts/verify-agents.sh` exits 0.
4. The debt row is removed or downgraded in the same change, and `status.md` updated.
5. The report lists files, commands, results, risks and IDs touched.

Production itself is done only when the Release gate in `AGENTS.md` is fully checked,
including the load test at the `N` chosen in D-03 and zero unresolved Blocker/High security
findings. Unit tests alone never establish readiness.
