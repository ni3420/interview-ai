# Status — Interview AI

Facts, not rules. Rules live in [AGENTS.md](../AGENTS.md); the audit and roadmap live in
[plan/production-readiness.md](plan/production-readiness.md). Re-check the claims below with
`bash scripts/verify-agents.sh`; the script exits non-zero when this file has gone stale.

> Last verified against the working tree: **2026-10-28**. Re-verify before relying on it.

## Runtime

Verified 2026-10-28:

- Client: Next.js 16.4 (App Router), React 19, TypeScript strict, Tailwind v4, Bun.
- Convex: local backend on `:3211`; **6 tables** — `users`, `interviews`, `answers`,
  `resumes`, `reports`, `reportJobs` (`convex/schema.ts`).
- Worker: Node + BullMQ over Valkey `:6379`; two queues (`resume-processing`,
  `report-evaluation`).
- AI service: FastAPI (uv), port 8000; Qdrant `:6333`; Gemini primary, Ollama fallback.
- Auth: Clerk v6. Convex identity is `identity.subject` → `users.clerkId`.
- Identity mirror (2026-10-29, G-50): `users` is written only from
  `ctx.auth.getUserIdentity()` via `convex/auth.ts:upsertUserFromIdentity`; a client that
  sends `clerkId` to `users:syncUser` is rejected by the argument validator
  (`Validator: v.object({email, imageUrl, name})` — `clerkId` is not a field).
- Profile mirror (2026-10-29, G-51): the JWT reaching Convex carries no email/name/picture
  claim, so identity-only sync wrote `email: ""` and left `name`/`imageUrl` absent.
  `users.syncUser` now accepts those as declared display values and the provider re-pushes
  once per distinct profile. Verified on the local deployment: the row for
  `user_3LMq5nwrzveGxXIGbt0NlUQMJgR` went from `email: ""` / no name / no image to
  `email` + `name: "Sanjay"` + `imageUrl` set, `updatedAt` after `createdAt`.
- Email uniqueness (2026-10-29, G-53): the local `users` table held 3 rows with 3
  distinct `clerkId` values, two of them carrying the same address
  (`s62463335@gmail.com`) because Clerk itself has two accounts for it — never two rows
  for one Clerk identity, which the single-transaction upsert already prevents. `users`
  now indexes `by_email` and `upsertUserFromIdentity` folds the address, refuses to
  insert a second row for an owned one (`EMAIL_ALREADY_LINKED`) and keeps a returning row
  on its own stored address. `RequireSyncedUser` names that rejection, withholds the
  useless Retry and the provider replaces the URL with `/sign-up?reason=email-taken`, so a
  refused visitor sees "This email address is already in use" on the sign-up page instead
  of a dashboard. Not done: the pre-existing rows are still there, and since `email` is
  partly client-declared until the Clerk JWT template carries the claim, this guarantees
  a stable display key, not proven address ownership. Every downstream table was empty
  when this was observed, so cleanup still costs no interview data.
  Wiring that redirect exposed a second bug in the same effect: `UserSyncProvider` pushed
  **every** signed-out visitor to `/sign-in`, including one already on `/sign-up`, so a
  new account could not be created from that page. It now exempts `/sign-in` and
  `/sign-up`. UNVERIFIED in a browser — no sign-up journey was run against the local stack
  after this change.
- Worker bridge: **6** `/worker/*` actions in `convex/http.ts` — `resume-complete`,
  `resume-failed`, `report-context`, `report-start`, `report-complete`, `report-failed` —
  authenticated by `X-Worker-Key`.
- Realtime: one Gemini Live speech-to-speech agent per Stream call, joined once from
  `/api/stream/agent`. Instructions are built at join (`realtime/instructions.py:38-69`);
  no per-turn retrieval; agent registry is in memory (`realtime/manager.py:19`).
- Transcript: Stream `call.closed_caption` → `transcription-panel.tsx` dedupe →
  `transcript-recorder.ts` reducer → `answers.saveAnswer` upsert on
  (`interviewId`, `questionIndex`).
- Plan shape: the prompt asks for **5–7** questions (`ai/prompts/interview.py:10`); the
  realtime agent caps its agenda at 25 (`config.py:72`); `durationMinutes` defaults to 30
  (`convex/interviews.ts:23`). Marketing copy must use these numbers.
- Design: no page implements the editorial system yet; `globals.css` still holds the
  neutral/violet tokens.
- Client build (2026-10-28): exit 0, 16 routes, **2.4 MB** raw static under `.next/static`,
  largest chunk **629 KB** raw. gzip and per-route First Load JS are not emitted by this
  Next 16.4 build.

## Performance baseline (2026-10-29)

Timing producers now exist (Q9): AI service `app/core/metrics.py`, worker `src/log.ts`,
room `room-timing.ts`, and the report-enqueue route. Numbers are local CPU inference with
small n — a baseline for comparing the next step, not a production SLA.

Model calls — `node scripts/bench-ai.mjs`, service started with
`AI_PROVIDER=ollama AI_FALLBACK_PROVIDER=` on port 8011. One warm-up is discarded;
`cold` is the first call of the scene.

| Scene | n | Errors | Cold | p50 | p95 |
|---|---|---|---|---|---|
| plan, 4.8k-char résumé | 10 | 1 (model returned question objects; HTTP 500) | 36.4 s | 19.9 s | 23.9 s |
| next-question | 5 | 0 | 7.5 s | 3.3 s | 3.4 s |
| evaluate, 6 Q&A | 3 | 0 | 28.4 s | 24.3 s | 33.4 s |
| embed 4.8k chars | 5 | 0 | 2.1 s | 0.33 s | 0.66 s |

Client payload — `node scripts/measure-client.mjs` (build exit 0, 16 routes): all static
JS **578.0 KB gzip** across 35 files. Per-route gzip (root layout + route chunks):

| Route | gzip |
|---|---|
| `/interview/[id]` | 459.2 KB |
| `/interview/setup` | 297.0 KB |
| `/interview/[id]/lobby` | 284.1 KB |
| `/dashboard` | 282.8 KB |
| `/interview/[id]/report` | 282.1 KB |
| `/reports` | 281.5 KB |
| `/` | 246.4 KB |

The interview room carries about 176 KB gzip more than the dashboard and 162 KB more than
any other route.

Not measured: live turn latency (Gemini Live exposes no hook), résumé download/extract/
index stages (needs a PDF + Qdrant), and any real-device session.

## Does not exist

Verified 2026-10-28:

- Hono, Inngest, Stripe or any billing backend. `client/src/app/api/stripe/{admin,checkout,recover,webhook}`
  and `client/src/app/admin/billing` are zero-file directories; `users` has no plan or
  `stripeCustomerId` field. A **pricing display toggle** does exist
  (`PricingSection.tsx:89`) — that is UI, not billing.
- `Sentry.init`, `withSentryConfig`, `instrumentation.ts` (grep: 0 hits).
  `client/src/lib/glitchtip.ts` wraps five call sites but drops events.
- `.github/` (no CI), rate limiting (grep `rate.?limit` in `.ts/.tsx/.js/.py`:
  0 hits; the only match is prose in `apps/ai-service/AGENTS.md`), security headers
  (`next.config.ts` has no `headers()`), pagination (no `paginate(` in `convex/`).
- `convex/tests/` is empty. Convex handler tests live in `client/test/convex.test.ts`
  and run inside Q3.
- No `apps/web` application: the directory contains only a stale `apps/web/AGENTS.md`
  describing a frontend that was never built. The real app is `client/`.
- Dead exports (application callers = 0; test/generated references noted):
  `components/layout/SyncUser.tsx`, `answers.incrementQuestionIndex` (asserted in
  `client/test/convex.test.ts`), `interviews.saveInterviewPlan` (asserted in the same test),
  `lib/ai-service.ts#generateNextQuestion`, and `/v1/realtime/leave` (no caller anywhere).

## Rule and tooling hazards

Verified 2026-10-28:

- `client/AGENTS.md` predates the root rules (it points at `@/features/components/...`
  and says nothing about `components/ui`); root `AGENTS.md` takes precedence.
- `apps/ai-service/AGENTS.md` is advisory local style and does not override root rules.
- AI-service lint is configured but cannot start: `uv run ruff check app` aborts with
  `Unknown rule selector 'QTY'` (G-47). `mypy` is configured and not gated.

## Gate baseline

Run 2026-10-28 from the directories shown in AGENTS.md §Commands. The table is a floor:
passing gates must stay green; failing gates must not get worse. Only the Release gate in
`AGENTS.md` requires every row to pass.

| Gate | Exact result |
|---|---|
| Q1 | **pass** — `bunx tsc --noEmit` exit 0 |
| Q2 | **pass with debt** — 0 errors, 9 warnings (unused imports) |
| Q3 | **FAIL** — 157 passed, 6 failed / 163 tests, 2 of 19 files (`InterviewLobby.test.tsx` 3, `JobDescriptionInput.test.tsx` 3) |
| Q4 | **pass** — 71 passed, 1 skipped |
| Q5 | **FAIL** — 44 hardcoded palette matches on the landing surface |
| Q6 | **not run** — no UI change in the audit |
| Q7 | **FAIL** — 13 toast calls; copy does not match D17 |
| Q8 | **FAIL** — `client/test/flows` does not exist |
| Q9 | **partial** (2026-10-29 re-run) — producers exist for 6 of 7 F9 rows; live turn latency has no hook. See §Performance baseline |
| Q10 | **pass** — typecheck 0, 11 tests passed / 0 failed |
| Q11 | **pass** — `bun run build` exit 0, 16 routes |
| Q12 | **FAIL** — 3 `dev-secret-key` hits (`compose.yaml:53,84`, `config.py:36`) |
| Q13 | **FAIL** — `uv run ruff check app` aborts on unknown selector `QTY` (G-47) |

Re-run 2026-10-29 after the G-50 fix (identity-derived `users` sync + verified-sync gate):
Q1 `bunx tsc --noEmit` exit **0**; Q2 `bun run lint` **0 errors, 9 warnings** (same 9);
Q3 `bun run test` **183 passed, 6 failed / 189 tests** — the same 2 files and same 6 tests
as the baseline (`InterviewLobby.test.tsx` 3, `JobDescriptionInput.test.tsx` 3, all G-25),
plus 26 new passing tests: `test/userSync.test.ts` (18) and
`test/RequireSyncedUser.test.tsx` (8). Not run: Q4–Q13.

Re-run 2026-10-29 after the G-51 profile fix (declared `email`/`name`/`imageUrl` + backfill):
Q1 exit **0**; Q2 **0 errors, 9 warnings** (same 9); Q3 `bun run test` **189 passed,
6 failed / 195 tests** — the same 2 files and same 6 G-25 tests as the baseline, plus 6
new passing tests. Identity-argument check: `rg -n "args\.(clerkId|userId|ownerId)" convex`
finds 0. Live probe: `convex run users:syncUser '{"clerkId":"user_victim", …}'` still fails
closed with `ArgumentValidationError`.

Re-run 2026-10-29 after the G-53 email-uniqueness fix (`by_email` + ownership check,
named rejection state and the `/sign-up?reason=email-taken` redirect): Q1 exit **0**;
Q2 `bun run lint` **0 errors, 9 warnings** (same 9); Q3 `bun run test` **198 passed,
6 failed / 204 tests** — same 2 files, same 6 G-25 tests (`InterviewLobby.test.tsx` 3,
`JobDescriptionInput.test.tsx` 3), plus 9 new passing tests: `test/userSync.test.ts`
22 → 28 and `test/RequireSyncedUser.test.tsx` 10 → 13. Isolated run
`bunx vitest run test/userSync.test.ts test/RequireSyncedUser.test.tsx` = **41 passed**.
Q11 `bun run build` exit **0**, 16 routes — `/sign-up` stays ƒ (dynamic), which is what the
new `useSearchParams` notice needs.
Q16 schema/index check: not run — `bunx convex codegen` refuses without a
`CONVEX_DEPLOYMENT` and the local backend on port 3210 was not restarted without approval,
so the `by_email` index is **UNVERIFIED on the deployment**. A local query against a
missing index errors at runtime, so the next `convex dev` push must be confirmed before the
first sign-in on a fresh account.

Load target for the release gate: **UNVERIFIED** — `N` concurrent interviews is not yet
chosen or measured.

Release gate: **1 of 11 satisfied** (the verify script only; checked 2026-10-28). The other
ten were re-checked against the code on 2026-10-28 and still fail.

## Drift log

Found during the 2026-10-28 audit; docs updated where noted:

| Claim | Old value | Verified value | Action |
|---|---|---|---|
| `/worker/*` action count | 5 (`architecture.md` §4) | **6** (`convex/http.ts`) | architecture.md corrected |
| G-18 priority | P2 (`architecture.md` §9) | **High** (success after swallowed failure) | AGENTS.md uses High |
| G-12 priority | P1 (`architecture.md` §9) | **Medium** (design-only) | AGENTS.md uses Medium |
| G-08 severity | `P1 (design)` | **High** | normalised |
| T6 "billing toggle does not exist" | no billing surface | billing display toggle exists at `PricingSection.tsx:89`; no FAQ | AGENTS.md T6 corrected |
| Duplicate G-09/G-14/G-21–G-24/G-26/G-29 rows and two Fix orders | reported in review | **not present** in the working-tree AGENTS.md (one row per ID, one Fix order) | no action |
| `architecture.md` §9 debt table | stopped at G-31; kept pre-rename severities | 14 IDs missing (G-32–G-46), G-18/G-12/G-08 disagreed with AGENTS.md | table replaced with a pointer to AGENTS.md + this file |
| `design-system.md` metric band | "8 questions" | product asks **5–7** and caps the agenda at 25 | doc corrected |
| `design-system.md` §3 | "the global `--signal` keeps `#F04D35`" | `globals.css` defines no `--signal` at all | doc corrected |
| `design-system.md` §13 FAQ probe | "FAQ opens with keyboard" | no `FaqSection` exists | probe replaced with the toast check |
| `architecture.md` §8 env table | listed `AI_SERVICE_API_KEY` only | the Python service reads `SERVICE_API_KEY`; compose bridges the two names | doc now states the mapping |
| Report evidence and score source | G-20 described coverage only | no quote per score (`schema.ts:68-72`); overall score is the model's `overall_score` (`report-processor.ts:167`), not derived | G-20 expanded, plan Phase 3 |
| Room conversational state | not registered | room shows only "Live"; leave control ends the interview | added G-49 |
| `scripts/verify-agents.sh` | gate claims it exits 0 | **file absent**; `scripts/` is empty | flagged 2026-10-29; not recreated without approval |
| Static build size | 2.4 MB raw (2026-10-28) | `.next/static` absent on 2026-10-29; scripted gzip measured instead (578.0 KB) | re-measured; see §Performance baseline |

## Report format

Every task report has five parts: what changed (by file); the commands run with exact
results; gates not run, worded `Not run: <gate>. Unverified. Risk: <what could break>`;
remaining risks and the debt IDs touched; and, for reviews, an explicit go/no-go.

## Evidence index

Line numbers are snapshots from 2026-10-28; re-read the file before relying on one.
Every debt row in AGENTS.md points at one of these.

| ID | Evidence |
|---|---|
| G-01 | `convex/users.ts:5-39`; `UserSyncProvider.tsx:49-54` |
| G-02 | grep `Sentry.init\|withSentryConfig\|instrumentation`: 0 hits; `lib/glitchtip.ts` |
| G-03 | empty dirs under `client/src/app/api/stripe/` and `client/src/app/admin/billing` |
| G-04 | `features/components/common/*` vs `components/ui/*`; `/reports` imports common |
| G-05 | `.github/` absent |
| G-06 | grep `rate.?limit` in source files: 0 hits |
| G-07 | `convex/schema.ts:25` (`plan: v.optional(v.any())`) |
| G-08 | `app/page.tsx`, `HeroSection.tsx`, setup, lobby, `stream-provider.tsx` |
| G-09 | `convex/resume.ts:125-136`; `vector_store.py:109` |
| G-10 | `convex/http.ts` manual payload checks |
| G-12 | `docs/decisions/0001-editorial-design-system.md` |
| G-13 | `realtime/manager.py:19`; `stream-provider.tsx:130-140` |
| G-14 | `validation.ts:7,10`; `worker/src/job.ts:20`; `schemas/interview.py:6-7`; `resume.ts#getProcessingContext` |
| G-15 | `app/interview/[id]/lobby/page.tsx:33` |
| G-16 | `realtime/instructions.py:38-69` |
| G-17 | `convex/answers.ts:26-31`; `transcript-recorder.ts:84` |
| G-18 | `setup/page.tsx:85-94`; `stream-provider.tsx:137-138` |
| G-19 | grep timing fields: 0 hits |
| G-20 | `worker/src/report-processor.ts:59-91,167`; `convex/schema.ts:68-72` |
| G-21 | `app/layout.tsx:29`; `UserSyncProvider.tsx:40-44` |
| G-22 | `config.py:36`; `deps.py:11`; `compose.yaml:53,84`; `lib/ai-service.ts:15` |
| G-23 | `convex/interviews.ts:51-80` |
| G-24 | `convex/resume.ts:28-33`; `ResumeUpload.tsx:82,98` |
| G-25 | `client/test/InterviewLobby.test.tsx`, `JobDescriptionInput.test.tsx` |
| G-26 | `api/stream/token/route.ts:11` |
| G-27 | `convex/answers.ts:18-22` |
| G-28 | dead exports listed above |
| G-29 | `providers/gemini.py:21-36` |
| G-30 | `client/src/proxy.ts:3-6` |
| G-31 | `convex/resume.ts:36-45` |
| G-32 | `convex/reports.ts:55-79` |
| G-33 | `convex/resume.ts:102-123`; `api/resume/process/route.ts:72,101` |
| G-34 | `use-transcript-recorder.ts:23`; `transcript-recorder.ts:25-30` |
| G-35 | `transcription-panel.tsx:146-150` |
| G-36 | `use-transcript-recorder.ts:35-42` |
| G-37 | `use-interview-timer.ts`; `runner.py:68-105`; `api/v1/realtime.py:57-61` |
| G-38 | `convex/http.ts:14` |
| G-39 | `worker/src/processor.ts:181-201` |
| G-40 | `report-processor.ts:218-223`; `convex/worker.ts:219-223`; `report/page.tsx:113-116,231` |
| G-41 | `convex/interviews.ts:5-27` |
| G-42 | `client/next.config.ts` (no `headers()`) |
| G-43 | `convex/resume.ts:125-136`; no `deleteInterview` |
| G-44 | `convex/reports.ts:98-121,182-202` |
| G-45 | `convex/interviews.ts:29-37`; `getAnswers`, `getUserReports` |
| G-46 | `fallback.py:22`; `realtime.py:15`; `manager.py:14`; `runner.py:19` |
| G-47 | `apps/ai-service/pyproject.toml:52`; `uv run ruff check app` → unknown selector `QTY` |
| G-49 | `interview-room.tsx:117` (`CallControls onLeave`); no state strings in the room |
