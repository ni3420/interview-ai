# AGENTS.md — Interview AI

> Rules only. Facts: [docs/status.md](docs/status.md). Architecture: [docs/architecture.md](docs/architecture.md). Design:
> [docs/design-system.md](docs/design-system.md). Plan: [docs/plan/production-readiness.md](docs/plan/production-readiness.md). Code wins; update this file in the same change. Re-check status with `bash scripts/verify-agents.sh` (script is currently missing — see `docs/status.md` Drift log).

## How to use this file

- Cite rules as `S1`, `C3`, `G-24`; cite process as "P2".
- Debt priorities are `Blocker`, `High`, `Medium` — never the old P0/P1/P2 scale; a bare `P1` means process rule P1.
- Every rule has a `Check:`; if it was not run, say so and never call it passed (Q0).
- Do not add a rule without a check.
- Nested files (`client/AGENTS.md`, `apps/ai-service/AGENTS.md`) add local style only; this file wins on conflict. `apps/web/` is not an app.

## Commands

Run from the repo root unless a `cd` is shown. Report the exact command and output.

- **Q0** Any gate not run is unverified; say "not run", never "should pass".
- **Q1 Types** `cd client && bunx tsc --noEmit` — exit 0.
- **Q2 Lint** `cd client && bun run lint` — 0 errors; warnings do not increase.
- **Q3 Unit** `cd client && bun run test` — all pass.
- **Q4 Python** `cd apps/ai-service && uv run pytest` — all pass.
- **Q5 Design** `cd client && rg -n -e "slate-" -e "zinc-" -e "emerald-" -e "amber-" -e "bg-white" -e "bg-black" src/features/components/landing src/app/page.tsx` — 0 matches; repeat for `Sparkles` and `-e gradient -e backdrop-blur`.
- **Q6 Manual** Light + dark screenshots at 1280 and 390; `scrollWidth === innerWidth`; theme toggle repaints.
- **Q7 Copy** `cd client && rg -n "toast\.[a-z]+" src` — every call matches D17 and the canonical copy in design-system §11.
- **Q8 Flow** `cd client && bunx vitest run test/flows` — the résumé-optional, transcript and report-coverage specs pass; a missing spec fails the gate.
- **Q9 Latency** `rg -n -e durationMs -e joinedAt -e turnLatency -e reportStartedAt client/src worker/src apps/ai-service/app` — at least one producer per F9 row.
- **Q10 Worker** `cd worker && bunx tsc -p tsconfig.json --noEmit && bun test` — both exit 0.
- **Q11 Build** `cd client && bun run build` — exit 0.
- **Q12 Secrets** `rg -n "dev-secret-key" compose.yaml apps/ai-service/app client/src --glob '!**/tests/**'` — 0 hits.
- **Q13 Py lint** `cd apps/ai-service && uv run ruff check app` — exit 0 (currently fails to start; G-47).

## Non-negotiables

1. Identity is derived, never accepted. (S1)
2. Ownership is enforced in Convex, not the UI. (S2)
3. The AI service is never a trust boundary. (S4)
4. One design system per surface. (D1)
5. A check not run is not a check passed. (Q0)
6. The report is derived from the persisted transcript. (F8)
7. Every retry is bounded and reports terminal failure once. (F10)
8. No success is reported before the operation commits. (D17)
9. Derived state is written only by the actor that derives it. (C10)
10. No default credentials and no `NEXT_PUBLIC_*` secrets. (S9, S15)

## Security (S)

- **S1** Derive identity from `ctx.auth`; never accept a client-supplied `clerkId`, `userId` or `email` as proof. Check: `rg -n "args\.(clerkId|userId|ownerId)" convex` = 0 and every auth-needing function calls `requireAuthUserId`. Violation: G-01.
- **S2** Filter every read and mutation by the caller's `users._id`, not by a supplied id. Check: each public function compares `row.userId` to `requireAuthUserId`. Violation: G-15.
- **S3** Re-check ownership of every id before read, update or delete; `v.id()` validates shape only. Check: every `ctx.db.get(args.*Id)` is followed by a `userId` comparison. Violation: G-41.
- **S4** Re-check identity, ownership and interview state in Convex before persisting AI output. Check: each `/worker/*` handler verifies the stored `userId` against the job before writing. Violation: none.
- **S5** Treat résumé, JD and answers as data; delimit them and ignore embedded instructions. Check: `cd apps/ai-service && uv run pytest -k untrusted`.
- **S6** Forward only allowlisted AI paths. Check: `rg -n "v1/interviews/(plan|next-question|evaluate)" client/src/app/api/ai`.
- **S7** Change status only in the backend; clients request transitions, never assert them. Check: `rg -n "status:" client/src` has no write to `interviews`, `resumes` or `reportJobs`. Violation: G-23, G-32, G-33, G-44.
- **S8** Fail closed on `/worker/*` and compare the service key in constant time. Check: `rg -n "X-Worker-Key|WORKER_SERVICE_KEY|timingSafeEqual|subtle.digest" convex/http.ts`. Violation: G-38.
- **S9** Keep secrets server-side; only non-secret `NEXT_PUBLIC_*` values reach the browser. Check: `rg -n "NEXT_PUBLIC_(AI_SERVICE_API_KEY|STREAM_API_SECRET|GEMINI|WORKER|CLERK_SECRET)" client/src` = 0. Violation: G-22.
- **S10** Treat declared upload metadata as UX only, never as validation. Check: `convex/resume.ts` uses `contentType`/`size` args for messaging only. Violation: G-24.
- **S11** Delete the blob, row, vectors, dependent rows and queued jobs together. Check: `rg -n "delete_resume_vectors|deleteInterview|deleteUser" convex apps/ai-service`. Violation: G-09, G-43.
- **S12** Return stable codes and human copy; never stack traces, provider names or raw `error.message`. Check: `rg -n "error\.message" client/src worker/src` = 0 in user-facing paths. Violation: G-40.
- **S13** Rate-limit public write paths per user. Check: `rg -ni "rate.?limit" client convex worker apps --glob '!**/*.md' -g '*.{ts,tsx,py}'` finds a limiter. Violation: G-06.
- **S14** Validate uploaded bytes — real length and `%PDF-` — before parsing or indexing. Check: `rg -n "%PDF-" client convex worker apps` > 0 and T15 passes. Violation: G-24.
- **S15** Refuse to start with a default service key and compare with `secrets.compare_digest`. Check: Q12 = 0. Violation: G-22.
- **S16** Declare every authenticated route in `client/src/proxy.ts`. Check: the matcher covers every non-public route; T16 passes. Violation: G-21, G-30.
- **S17** Set CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options` and `Referrer-Policy`. Check: `rg -n "headers\(" client/next.config.ts` and `curl -I`. Violation: G-42.
- **S18** Mirror identity before writing and wait for it before loading an authenticated route: `users` rows come only from `ctx.auth.getUserIdentity()`, and a protected route fires Convex calls only after `users.getSyncStatus` reports `synced`. Declared profile fields (`email`, `name`, `imageUrl`) may fill the row's display columns but never select the row. Check: `rg -n "RequireSyncedUser" client/src/components/layout/DashboardLayout.tsx` finds the gate, `rg -n "args\.(clerkId|userId|ownerId)" convex` finds 0 and `cd client && bunx vitest run test/userSync.test.ts test/RequireSyncedUser.test.tsx` passes. Violation: G-50, G-51.

## Data and Convex (C, A)

- **C1** Validate every argument; no `v.any()` for new fields. Check: `rg -n "v.any\(\)" convex/schema.ts` = 0. Violation: G-07.
- **C2** Use declared indexes; no `.filter()` on an unindexed field in a hot path. Check: `rg -n "\.filter\(" convex` = 0 in per-turn paths. Violation: G-27.
- **C3** Make mutations idempotent where retries are possible. Check: T3 passes.
- **C4** Never log row contents. Check: `rg -n "console\.(log|error)" convex` shows no row dumps.
- **C5** Make non-client functions `internalMutation` or `internalQuery`. Check: every `export const` in `convex/` that the client does not call is internal.
- **C6** Take timestamps from the server. Check: `rg -n "createdAt|updatedAt" convex` writes use `Date.now()`.
- **C7** Reject transitions outside F2; otherwise do not expose the mutation. Check: T14 passes. Violation: G-23.
- **C8** Look up by index, not filter. Check: `rg -n "by_interview_question" convex`. Violation: G-27.
- **C9** Remove dead writers. Check: `rg -n "saveInterviewPlan|incrementQuestionIndex" client/src convex`. Violation: G-28.
- **C10** Write derived state only where it is derived; clients may request, not assert. Check: `rg -n "api\.(reports\.saveReport|resume\.markResumeStatus)" client/src` = 0. Violation: G-32, G-33, G-44.
- **C11** Ownership-check every stored foreign id in the same mutation. Check: `createInterview` fetches `resumeId` and compares `userId`. Violation: G-41.
- **A1** Keep packages independent; do not add a root workspace without unifying lockfiles. Check: no `workspaces` in root `package.json`.
- **A2** Treat Convex as the source of truth; the AI service returns results only. Check: no Convex client in `apps/ai-service`.
- **A3** Talk to Convex from the worker only through `/worker/*`. Check: `rg -n "convex" worker/src` shows HTTP calls only.
- **A4** Talk to the AI service from the client only through `/api/ai/[...path]`. Check: `rg -n "AI_SERVICE_URL" client/src`.
- **A5** Put long work on BullMQ; never hold a request open for model inference. Check: `rg -n "new Queue\(" client/src/lib`.
- **A6** Add new env vars to `compose.yaml` and `docs/architecture.md` §8 together. Check: both files change in the same diff.
- **A7** Make schema changes additive first; a breaking rename needs a migration and an ADR. Check: `docs/decisions/`.
- **A8** Default to Server Components; use `"use client"` only for state, effects, browser APIs or SDKs. Check: `rg -n '"use client"' client/src/app`.
- **A9** Supervise the realtime agent outside BullMQ and expose its state through Convex. Check: W7.
- **A10** Never compute a security decision in the browser. Check: `rg -n "isOwner|isAdmin|role" client/src` = 0.

## Frontend and design (D)

- **D1** Use one design system per surface; never mix `.landing-editorial` with root tokens. Check: `rg -n "landing-editorial" client/src/app`.
- **D2** Use no AI sparkle decoration or decorative icons. Check: `rg -n "Sparkles" client/src`.
- **D3** Use no gradients, glass or blur on the landing surface. Check: Q5.
- **D4** Keep one primary CTA per section. Check: screenshot.
- **D5** Take type sizes from design-system §4. Check: `rg -n "text-\[" client/src`.
- **D6** Use semantic tokens; no `slate-*`, `zinc-*`, `emerald-*`, `amber-*`, `bg-white`, `bg-black` in new work. Check: Q5.
- **D7** Show real product evidence in the first viewport. Check: screenshot at 1280.
- **D8** Implement loading, empty, error, hover, focus-visible, active and disabled states. Check: screenshot and keyboard pass.
- **D9** Verify dark mode parity. Check: paired light/dark screenshots.
- **D10** Avoid horizontal overflow at 390px and 1280px. Check: `scrollWidth === innerWidth`.
- **D11** Keep focus visible; `--ring` is the only focus color. Check: every `outline-none` has a ring on the same element.
- **D12** Use `components/ui/*` for new work; migrate `features/components/common/*` when touched. Check: `rg -l "features/components/common" client/src`.
- **D13** Record token changes in an ADR and re-check dashboard, interview and auth. Check: `docs/decisions/`.
- **D14** Write concrete copy; never use the forbidden marketing words. Check: `rg -n "revolutionize|supercharge|seamless|unlock the power" client/src`.
- **D15** Prove UI claims with a screenshot or computed style. Check: evidence attached to the report.
- **D16** Use one `h1` per page and label landmarks and controls. Check: `rg -n "<h1" client/src/app`.
- **D17** Keep toasts truthful, specific and single-id; success only after commit. Check: Q7 and design-system §11. Violation: G-18.
- **D18** Show every async step inline; a toast is never the only indicator. Check: screenshot.
- **D19** Name degraded states; never show "ready" when a dependency is down. Check: state review on the affected screen.
- **D20** Label optional fields as optional and remove required markers. Check: `rg -n "optional" client/src/features/interview`.

## AI, realtime and worker (F, W)

- **F1** Move résumés `uploaded → processing → ready | failed`; only the worker sets `ready`. Check: T2 and G-33. Violation: G-33.
- **F2** Allow only `setup→in_progress|failed`, `in_progress→completed|failed`, `failed→setup`. Check: T14. Violation: G-23.
- **F3** Keep `reportJobs` `queued → processing → completed | failed`; the UI observes only. Check: T2. Violation: G-32, G-44.
- **F4** Validate AI output — shape, ranges, non-empty arrays, score count — before persistence. Check: T4 and T11.
- **F5** Accept a résumé, a JD or both; never require a résumé; accept a JD of ≥ 20 characters. Check: T9. Violation: G-14.
- **F6** Ground each turn in the candidate's last claim, retrieve on new topics, ask one question, never assert unstated facts, treat the plan as an agenda. Check: no automated check yet; Q8 fails.
- **F7** Persist every question and answer exactly once, in order, with the question actually asked. Check: T10 and T20. Violation: G-34, G-35, G-36, G-17.
- **F8** Derive the report from persisted answers with one score per answer. Check: T11. Violation: G-20.
- **F9** Meet p95 budgets: dispatch ≤ 1.5 s, agent audible ≤ 5 s, turn ≤ 2.5 s, caption→row ≤ 2 s, report enqueue ≤ 0.5 s, queued→processing ≤ 10 s, text call ≤ 120 s. Check: Q9 and the F9 metrics. Violation: G-19.
- **F10** Retry only within bounds: provider 3×, switch to Ollama, résumé 3×/5 s, report 2×/30 s, dispatch 3× (1/3/9 s), turns 3× (0.5/2/5 s), report retry 1×. Check: T3 and T12. Violation: G-13, G-36.
- **F11** Keep or block the prior résumé while a job references it. Check: T3 covers replacement. Violation: G-31.
- **F12** Give every session a server-owned end; stop the agent and close the row on expiry or tab close. Check: T21. Violation: G-37, G-26.
- **W1** Bound retries with exponential backoff and report only terminal failure. Check: T3 and worker tests.
- **W2** Give jobs stable ids and make them safe to re-run. Check: `rg -n "jobId" client/src/lib`.
- **W3** Emit structured JSON logs with `level` and `message`; no résumé text, tokens or PII. Check: worker log lines parse as JSON.
- **W4** Select providers from server config; tests must not need a live model. Check: `rg -n "AI_PROVIDER|AI_FALLBACK_PROVIDER"`.
- **W5** Version the embedding model and dimension with the collection name. Check: `rg -n "EMBEDDING_MODEL|QDRANT_COLLECTION"`.
- **W6** Shut down workers and connections gracefully. Check: `worker/src/index.ts` handles SIGTERM and SIGINT.
- **W7** Persist realtime session state; dispatch idempotently per call id. Check: `rg -n "realtimeSessions" convex`. Violation: G-13.
- **W8** Retrieve per turn, filtered by owner and résumé inside the AI service. Check: `rg -n "retriev" apps/ai-service/app/realtime`. Violation: G-16.
- **W9** Upsert answers on (`interviewId`, `questionIndex`) and update `question`, `answer` and `followUpCount`. Check: `convex/answers.ts`. Violation: G-17.
- **W10** Keep instruction building, turn reduction and retrieval routing as pure functions with unit tests. Check: `rg -n "transcript-recorder|build_instructions" client/test apps/ai-service/tests`.
- **W11** Give every outbound call an explicit timeout. Check: `rg -n "timeout|AbortSignal" client/src worker/src apps/ai-service/app`.
- **W12** Give every model call an explicit per-request timeout. Check: T18. Violation: G-29.
- **W13** Fail closed when worker Convex config is missing. Check: T22. Violation: G-39.

## Process (P)

- **P1** Read `docs/architecture.md`, this file and the files you will touch before editing. Check: report lists them.
- **P2** State the goal and acceptance criteria in one paragraph before coding. Check: report contains it.
- **P3** Implement the smallest complete slice; no drive-by refactors. Check: diff scope.
- **P4** Run every gate the change can break. Check: commands and outputs in the report.
- **P5** Report files, commands, results, risks and debt ids. Check: report follows docs/status.md format.
- **P6** Stop for approval before the next stage. Check: no unrequested stage in the diff.
- **P7** Never commit, push, deploy or delete data without explicit instruction. Check: `git status` before and after.
- **P8** Inspect `git status` and `git log` before writing if the tree looks unfamiliar. Check: command output quoted.

## Tests (T) — `missing` means the test does not exist; a missing test fails the release gate, it does not pass.

- **T1** A user cannot read or mutate another user's interview, résumé or report. Check: `client/test/convex.test.ts` cross-account cases.
- **T2** Invalid transitions are rejected. Check: convex tests.
- **T3** Re-running a job does not duplicate records. Check: worker tests.
- **T4** Malformed provider output is rejected, not persisted. Check: ai-service tests.
- **T5** Wrong type and oversize uploads are rejected. Check: missing.
- **T6** Theme toggle works and there are no console errors; no FAQ surface exists. Check: missing.
- **T7** Deleting a résumé or interview removes blob, row, vectors, dependents and jobs. Check: missing.
- **T8** Landing has zero sparkles, zero gradients and no overflow. Check: Q5 and Q6.
- **T9** `resumeId == null` reaches a non-empty plan, starts and reports. Check: missing.
- **T10** Replaying a caption or save yields one row with the latest text. Check: missing.
- **T11** Every answer has exactly one score; a partial response fails. Check: missing.
- **T12** Three failed dispatches produce one failed state and a Rejoin. Check: missing.
- **T13** Toasts match D17; no success on a swallowed failure. Check: missing.
- **T14** Every illegal transition is rejected; the legal set matches F2. Check: convex tests.
- **T15** A non-`%PDF-` file is rejected before extraction; 6 MB is rejected server-side. Check: missing.
- **T16** Signed out, only `/` and `/sign-in` render; other routes redirect first. Check: missing.
- **T17** A second dispatch while joined returns `already_running`. Check: missing.
- **T18** The Gemini client is built with an explicit timeout. Check: config assertion.
- **T19** A client cannot set a résumé to `ready`. Check: missing.
- **T20** Reload and re-delivery resume and update without duplicates. Check: missing.
- **T21** Expiry closes the row and stops the agent; tab close does not leave `in_progress`. Check: missing.
- **T22** Missing Convex config fails the job. Check: worker tests.
- **T23** A failed report shows D17 copy, never `error.message`. Check: missing.
- **T24** A signed-in user never runs an authenticated Convex call before the `users` row exists, and a client cannot pass a `clerkId`. Check: `cd client && bunx vitest run test/userSync.test.ts test/RequireSyncedUser.test.tsx`. Violation: G-50.

## Debt register

Priorities: **Blocker** = security/data loss; **High** = blocks a flow or hides failures; **Medium** = correctness/cost/hygiene. G-11 merged into G-04; evidence and gate status: [docs/status.md](docs/status.md).

| ID | Priority | Rule | File | Fix | Owner |
|---|---|---|---|---|---|
| G-01 | Blocker | S1 | `convex/users.ts` | Fixed 2026-10-29: `syncUser` takes no arguments and mirrors `ctx.auth` only. Residual: cross-account coverage for T1. | unassigned |
| G-02 | High | — | `client/src/lib/glitchtip.ts` | Add `instrumentation.ts`; initialise Sentry server-side. | unassigned |
| G-03 | Medium | — | `client/src/app/api/stripe/` | Delete the empty route directories. | unassigned |
| G-04 | High | D12 | `client/src/features/components/common/` | Freeze `common/*`; migrate on touch. | unassigned |
| G-05 | High | Q4 | `.github/` | Add CI for Q1–Q4, Q10, Q11. | unassigned |
| G-06 | High | S13 | `client/src/app/api/` | Add per-user token buckets on write routes. | unassigned |
| G-07 | Medium | C1 | `convex/schema.ts` | Type `interviews.plan`; backfill. | unassigned |
| G-08 | High | D1, D6 | `client/src/app/page.tsx` | Apply design-system §2–§7, then §12. | unassigned |
| G-09 | High | S11 | `convex/resume.ts` | Delete Qdrant vectors with the résumé. | unassigned |
| G-10 | Medium | C3 | `convex/http.ts` | Share one schema per worker contract. | unassigned |
| G-12 | Medium | D13 | `docs/decisions/0001-editorial-design-system.md` | Promote the palette via ADR 0002. | unassigned |
| G-13 | High | W7, F10 | `apps/ai-service/app/realtime/manager.py` | Persist `realtimeSessions`; retry dispatch; Rejoin. | unassigned |
| G-14 | High | F5 | `client/src/features/interview/validation.ts` | Relax the four guards to F5 limits. | unassigned |
| G-15 | High | S2, F5 | `client/src/app/interview/[id]/lobby/page.tsx` | Read the interview's own résumé. | unassigned |
| G-16 | High | F6, W8 | `apps/ai-service/app/realtime/instructions.py` | Add per-turn retrieval filtered by owner. | unassigned |
| G-17 | High | F7, W9 | `convex/answers.ts` | Patch `question` on every upsert; derive `followUpCount`. | unassigned |
| G-18 | High | D17 | `client/src/app/interview/setup/page.tsx` | Apply D17; success only after a 202. | unassigned |
| G-19 | High | F9 | — | Record join, turn and report timings. | unassigned |
| G-20 | High | F8 | `worker/src/report-processor.ts` | Enforce score count = answers, store a quote per score, derive the overall score. | unassigned |
| G-21 | High | S16 | `client/src/components/layout/UserSyncProvider.tsx` | Move redirects into `proxy.ts`; sync only when signed in. | unassigned |
| G-22 | High | S15, S9 | `apps/ai-service/app/core/config.py` | Require the key; `compare_digest`; remove the public base URL. | unassigned |
| G-23 | High | C7 | `convex/interviews.ts` | Enforce F2; make worker transitions internal. | unassigned |
| G-24 | High | S14, S10 | `convex/resume.ts` | Check `%PDF-` and real byte length server-side. | unassigned |
| G-25 | High | Q3 | `client/test/` | Fix the 6 failing UI tests. | unassigned |
| G-26 | High | F12 | `client/src/app/api/stream/token/route.ts` | Mint for duration + 10 min, or refresh on reconnect. | unassigned |
| G-27 | Medium | C8 | `convex/answers.ts` | Add `by_interview_question`; use `.unique()`. | unassigned |
| G-28 | Medium | C9 | `convex/answers.ts` | Delete dead writers and exports. | unassigned |
| G-29 | Medium | W12 | `apps/ai-service/app/ai/providers/gemini.py` | Set an explicit per-request timeout. | unassigned |
| G-30 | High | S16 | `client/src/proxy.ts` | Add `/reports` and every auth route to the matcher. | unassigned |
| G-31 | Medium | F11 | `convex/resume.ts` | Keep or block the prior résumé while a job is pending. | unassigned |
| G-32 | High | C10 | `convex/reports.ts` | Make `saveReport` internal or delete it. | unassigned |
| G-33 | High | C10 | `convex/resume.ts` | Split `markResumeStatus`; only the worker sets `ready`. | unassigned |
| G-34 | High | F7 | `client/src/features/interview/room/use-transcript-recorder.ts` | Hydrate the recorder from `answers` on mount. | unassigned |
| G-35 | High | F7 | `client/src/features/interview/room/transcription-panel.tsx` | Persist the latest caption text on update. | unassigned |
| G-36 | High | F10 | `client/src/features/interview/room/use-transcript-recorder.ts` | Retry turn saves 3×; then show degraded. | unassigned |
| G-37 | High | F12 | `apps/ai-service/app/realtime/runner.py` | Add a server deadline, reaper and `realtime/leave` call. | unassigned |
| G-38 | High | S8 | `convex/http.ts` | Compare key digests in constant time. | unassigned |
| G-39 | High | W13 | `worker/src/processor.ts` | Throw when Convex config is missing. | unassigned |
| G-40 | Medium | S12 | `worker/src/report-processor.ts` | Store stable codes; render D17 copy. | unassigned |
| G-41 | Medium | C11 | `convex/interviews.ts` | Check `resumeId` ownership in `createInterview`. | unassigned |
| G-42 | High | S17 | `client/next.config.ts` | Add the S17 headers. | unassigned |
| G-43 | High | S11 | `convex/resume.ts` | Cascade interview/account deletion; cancel jobs. | unassigned |
| G-44 | High | C10, F3 | `convex/reports.ts` | Require `completed`; make the failure writer internal. | unassigned |
| G-45 | Medium | C2 | `convex/interviews.ts` | Paginate list queries. | unassigned |
| G-46 | Medium | W3 | `apps/ai-service/app/api/v1/interviews.py` | Add JSON logs with a request id. | unassigned |
| G-47 | Medium | Q13 | `apps/ai-service/pyproject.toml` | Remove the unknown ruff selector `QTY`; extend to unused rule groups. | unassigned |
| G-49 | Medium | D8 | `client/src/features/interview/room/interview-room.tsx` | Show preparing/listening/responding/reconnecting; confirm before leave. | unassigned |
| G-50 | Blocker | S1, S18 | `convex/auth.ts`, `client/src/components/layout/UserSyncProvider.tsx` | Fixed 2026-10-29: identity-derived `users` upsert in one transaction; `createInterview` writes its own owner row; protected routes wait on `users.getSyncStatus`. Residual: signed-in cold start unmeasured. | unassigned |
| G-51 | High | S1, S10 | `convex/users.ts`, `client/src/components/layout/UserSyncProvider.tsx` | Fixed 2026-10-29: the Clerk JWT reaching Convex carries no email/name/picture claim, so `users.email` was written as `""` and `name`/`imageUrl` never landed. `syncUser` now takes declared profile fields (identity claims still win) and the provider re-pushes once per distinct profile, backfilling existing rows. Proper remedy: add those claims to the Clerk JWT template. | unassigned |
| G-52 | High | S1 | Clerk Dashboard (not this repo) | Open: a first social sign-in returns "External Account was not found". Observed 2026-10-29; not yet diagnosed from code and not fixable here — needs the Clerk app's OAuth provider configuration. | unassigned |

## Release gate

Every item must be demonstrated, not asserted.

- [ ] G-01 closed; cross-account tests in `client/test/convex.test.ts` pass (T1).
- [ ] G-50 closed under a real session: a signed-in deep link to `/interview/<id>/lobby` waits for `users.getSyncStatus` instead of firing against a missing row (T24 passes; the signed-in cold start is still unmeasured).
- [ ] CI runs Q1–Q4, Q10, Q11 on every PR and is green (G-05).
- [ ] Q12 returns 0; the AI service refuses to start without a key (G-22).
- [ ] Every key comparison is constant-time; uploads are byte-validated (G-38, G-24).
- [ ] Security headers and per-user rate limits are active (G-42, G-06).
- [ ] Errors reach the monitor: an induced route error produces one event (G-02).
- [ ] Q9 has timing data for all F9 rows (G-19).
- [ ] Realtime state is in Convex; `rg -n "_tasks" apps/ai-service/app/realtime` = 0 (G-13).
- [ ] A load test at the `N` recorded in docs/status.md passes; `N` is currently UNVERIFIED.
- [ ] T19–T23 pass; a 30-minute interview survives reload, caption re-delivery, agent failure and tab close with a full report.
- [x] `bash scripts/verify-agents.sh` exits 0 (demonstrated 2026-10-28).

## Done means

"Done" requires every gate that passes in `docs/status.md` to still pass, no failing gate to get worse (same counts, files and errors), `bash scripts/verify-agents.sh` to exit 0, and the report to list every command and output. If a gate was not run, write exactly: "Not run: `<gate>`. Unverified. Risk: `<what could break>`." Never write "should pass". The Release gate is absolute, not ratcheted.
