# UI/UX Audit — Interview AI

**Phase:** 1b
**Date:** 2026-10-31
**Scope rule:** read-only audit. No application code, styles, schema, config, or dependency changed. Only this file was created.

---

## 0. Method and limitations

- Findings come from source inspection (routes, layouts, components, data queries). Every row cites a path and line that was read in this session.
- **No visual verification was performed.** Clerk-protected routes redirect without an authenticated session; no browser/screenshot run was possible. Statements about spacing, contrast, and visual polish are therefore limited to what the code specifies. Anything that cannot be proven from code is marked *not verified*.
- No web browsing was performed for this audit. The "reference pattern" column names well-known public interaction patterns only; these are **design suggestions**, not verified current capabilities of those products.
- Per `AGENTS.md` §Research Rules, external recommendations would normally be logged with source/URL/learning. Since no URL was fetched, the external-sources section states that explicitly rather than inventing citations.

---

## 1. Screen inventory (verified routes)

| Route | Purpose | Primary data source | Appears in AGENTS.md Phase 9? |
|---|---|---|---|
| `/` | Marketing landing | Static content | Indirectly (positioning) |
| `/sign-in`, `/sign-up` | Clerk auth | Clerk | Foundation |
| `/dashboard` | Overview, stats, task table, schedule, notes | Convex `getInterviews` | Yes |
| `/interview/setup` | Resume + JD + duration + create | Convex + FastAPI (async) | Yes (job creation) |
| `/interview/[id]/lobby` | Device check, readiness, start | Convex resume/interview | Yes (scheduling/join) |
| `/interview/[id]` | Live room, transcript, controls | Stream + Convex | Yes |
| `/interview/[id]/report` | Report states, rubric, evidence, regeneration | Convex `getReport/getReportJob` | Yes |
| `/interview/[id]/review` | Q&A and narrative feedback | Convex answers/report | Yes (evidence review) |
| `/reports` | Cross-interview analytics, CSV | Convex reports | Yes (analytics) |
| *Missing* | Jobs & roles, candidates/pipeline, scheduling list, credits/billing, settings, integrations, provider/ops | — | Yes (required; absent) |

---

## 2. Global findings

### U-01 — Product positioning contradicts the B2B target (High)

- **Screen/workflow:** Global shell, landing, setup, metadata.
- **Evidence:** Metadata says "AI-powered interview preparation platform" (`client/src/app/layout.tsx:19-22`); footer repeats it (`client/src/app/page.tsx:84`); hero sells practice to candidates (`client/src/features/components/landing/HeroSection.tsx:143-155`); setup is "Set Up AI Mock Interview" (`client/src/app/interview/setup/page.tsx:132`); dashboard says "Track your interview prep" (`client/src/app/dashboard/page.tsx:85`).
- **Current behavior:** The entire product language addresses a job candidate preparing for interviews.
- **Usability problem:** `AGENTS.md:2` defines Interview AI as a B2B SaaS for AI voice interviews. A recruiter evaluating the product sees a consumer practice tool; a candidate sees pricing for a team product. The information architecture has no hiring-org concepts.
- **User/business impact:** Wrong audience, wrong navigation, wrong success metrics; blocks team billing and pipeline workflows.
- **Recommendation:** Make one explicit positioning decision before Phase 9, then rewrite landing, metadata, empty states, and navigation to that model. If B2B is confirmed, the candidate-facing "mock interview" copy must move to a candidate invitation/experience surface.
- **Reference pattern:** Recruiter-first IA (jobs, candidates, interviews, reports) as used by Ashby/Greenhouse public product tours — design suggestion, not copied layout.
- **Effort:** M (copy/IA); L if domain screens follow.
- **Phase 9:** Yes — 9a (shell/IA); full reposition requires a product decision before 9b.

### U-02 — Dead navigation, dead anchors, and a non-functional global search (High)

- **Screen/workflow:** Sidebar, navbar, landing header.
- **Evidence:** Sidebar links to `/history` and `/settings` (`client/src/features/components/layout/Sidebar.tsx:27-33`), neither route exists; duplicate Sidebar at `client/src/components/layout/Sidebar.tsx` carries the same links; global search input (`client/src/features/components/layout/Navbar.tsx:101-119`) filters nothing and is not a command menu; landing nav points to `#solutions` and `#how-it-works` which are empty `sr-only` divs (`client/src/app/page.tsx:11-16,72-73`).
- **Current behavior:** Clicking History/Settings lands on a 404; typing in search does nothing; landing anchors scroll nowhere.
- **Usability problem:** Three separate dead ends in primary navigation. `AGENTS.md:24` explicitly forbids fake controls.
- **User/business impact:** Immediate trust loss; users cannot manage their account; recruiters assume the product is unfinished.
- **Recommendation:** Either implement Settings (Phase 9d) and remove History in favor of Reports, or mark them unavailable; replace fake search with a real command palette scoped to existing entities, or remove it; delete empty anchors or add real sections.
- **Reference pattern:** Linear-style command menu (⌘K) for navigation/actions — well-known pattern.
- **Effort:** S (remove/disable) to M (command menu).
- **Phase 9:** Yes — 9a.

### U-03 — Pricing and plan claims are unenforced (High)

- **Screen/workflow:** Landing pricing.
- **Evidence:** `client/src/features/components/landing/PricingSection.tsx:22-60` promises "3 mock interviews / month", "Unlimited mock interviews", "Shared candidate workspace", "Role-based access", with all CTAs pointing to `/sign-up`; no billing backend exists (`convex/schema.ts` has no wallet/ledger; `client/src/app/api/stripe` and `client/src/app/admin/billing` are empty; `stripe` is not a dependency); `.env.example:39-50` references Stripe anyway.
- **Current behavior:** Prices and limits are hardcoded marketing text.
- **Usability problem:** Users can "Go Pro" and receive no plan, no limit, and no invoice. This violates `AGENTS.md:24` and Phase 9's "never display fabricated balances or payment success".
- **User/business impact:** Refund/chargeback and consumer-protection risk; every claim becomes a support ticket.
- **Recommendation:** Until Phase 3 ships, remove pricing or label plans "Unavailable — not yet offered". When billing exists, drive prices/limits from the ledger and show real usage.
- **Reference pattern:** Stripe-style plan/usage panels with explicit status (active, past due, limit reached) — design suggestion.
- **Effort:** S (remove/mark) / L (real billing).
- **Phase 9:** Yes — 9e (truthfulness) and 9d (billing UI after Phase 3).

### U-04 — Decorative "AI" styling violates the design rules (Medium)

- **Screen/workflow:** Landing, setup, JD input, lobby, review, sidebar.
- **Evidence:** Sparkles icons at `page.tsx:4,32`; `setup/page.tsx:129,260,275`; `JobDescriptionInput.tsx:107`; `interview-lobby.tsx:138`; `review/page.tsx:310`; `Sidebar.tsx:103`. Radial gradient glow behind the landing page (`page.tsx:22-24`).
- **Current behavior:** Sparkle motifs and a purple glow are used as the visual identity.
- **Usability problem:** `AGENTS.md:142` forbids sparkle icons and gradient-glow cards and requires the product not to read as AI-generated. The motifs add no information and compete with status content.
- **User/business impact:** Premium/recruiter perception drops; visual noise around operational data.
- **Recommendation:** Replace Sparkles with neutral, role-based iconography (building, users, clipboard, chart); remove glow layers; reserve accent color for state and primary action.
- **Reference pattern:** Neutral, information-first surfaces (Linear/Vercel dashboards) — design suggestion.
- **Effort:** S–M.
- **Phase 9:** Yes — 9a.

### U-05 — "Time Saved" is a fabricated metric (Low)

- **Screen/workflow:** Dashboard stats.
- **Evidence:** `client/src/features/components/dashboard/StatsOverview.tsx:12-13` defines `MINUTES_PER_INTERVIEW = 15`; `:52` multiplies completed interviews by it; `:63-65` displays it as "Time Saved" with an "Estimated" hint.
- **Current behavior:** A fixed 15-minute assumption is presented alongside measured counts.
- **Usability problem:** The rule is "no fabricated metrics" (`AGENTS.md:24,152`). Even with an "estimated" hint, it reads as data.
- **Recommendation:** Compute real duration from `startedAt`/`completedAt` (already stored on interviews) or remove the card.
- **Reference pattern:** Stripe/Vercel metrics that always expose their calculation basis — design suggestion.
- **Effort:** S.
- **Phase 9:** Yes — 9b.

---

## 3. Workflow findings

### U-06 — Setup reports success when resume processing has already failed (High)

- **Screen/workflow:** Interview setup → lobby.
- **Evidence:** `client/src/app/interview/setup/page.tsx:83-95` awaits `/api/resume/process` inside a `try/catch` that only logs; it does not check `response.ok`, and `fetch` resolves for HTTP 500/502. It then shows "Interview created successfully!" (`:94`) and navigates to the lobby.
- **Current behavior:** Enqueue failures (including the route's 502 `enqueue_failed` response) are invisible; the user is told everything succeeded.
- **Usability problem:** The user waits in the lobby for questions that will never arrive. This is the exact "fake success state" the contract forbids.
- **User/business impact:** Abandoned interviews, wasted AI spend on re-tries, support load, and poor report quality.
- **Recommendation:** Treat non-2xx as failure; keep the user on setup with an inline retry (and a link to continue without tailoring only if explicitly supported); make the lobby show a recoverable error with "Retry processing".
- **Reference pattern:** Deployment checklist with failed stage + retry (Vercel-style status) — design suggestion.
- **Effort:** S (error propagation) + S (retry control).
- **Phase 9:** Yes — 9b; the retry endpoint belongs to Phase 4.

### U-07 — Start is not gated on resume readiness, and failure has no recovery action (High)

- **Screen/workflow:** Lobby readiness.
- **Evidence:** `client/src/features/interview/lobby/processing-checklist.tsx:21-29,61-63` renders `error`/`pending` states for resume processing, but the checklist has no retry button; `interview-lobby.tsx:131` computes `canStart = isReady && devicesReady && !isStarting` — `isReady` is Stream/config readiness, not `resumeStatus`; the start button is disabled only by that (`:204-207`).
- **Current behavior:** A candidate can start the interview while processing is `processing`, `uploaded`, or `failed`.
- **Usability problem:** The AI interviewer may have no plan/questions; the candidate sees a normal interview and later a weak or failed report, with no explanation.
- **User/business impact:** Invalid interviews and misleading reports; no way to recover without leaving the flow.
- **Recommendation:** Gate start on `resumeStatus === "ready"` (or offer an explicit degraded mode), show the failed step with a retry action, and explain what is still happening.
- **Reference pattern:** Stripe-style status feedback with a single clear recovery action — design suggestion.
- **Effort:** S–M.
- **Phase 9:** Yes — 9c (UI) with backend retry in Phase 4.

### U-08 — Lobby can describe a different resume than the interview uses (Medium)

- **Screen/workflow:** Lobby readiness.
- **Evidence:** `client/src/app/interview/[id]/lobby/page.tsx:33` queries `api.resume.getMyResume` (newest resume for the user), while the interview stores its own `resumeId` (`convex/schema.ts:90`).
- **Current behavior:** With multiple uploads, the checklist reflects the latest file rather than the selected one.
- **Usability problem:** "Resume received / processing / ready" can be true for a file the interview does not use.
- **Recommendation:** Query by `interview.resumeId` and render that file's name/status.
- **Reference pattern:** Resource-scoped detail views (Linear issue → linked resource) — design suggestion.
- **Effort:** S.
- **Phase 9:** Yes — 9b after the backend query exists (see architecture A-24).

### U-09 — The live room hides connection state and leaks raw errors (High)

- **Screen/workflow:** Live interview room.
- **Evidence:** Header always shows a green pulsing "Live" badge (`client/src/features/interview/room/interview-room.tsx:85-90`); provider errors render `error.message` directly (`client/src/features/interview/room/stream-provider.tsx:162-175`); no reconnect state, network quality, or retry control was found.
- **Current behavior:** A dropped or degraded connection looks identical to a healthy call; failures show SDK text.
- **Usability problem:** Candidates cannot tell whether to wait, reconnect, or end the call; internal/provider details may be exposed; there is no recovery path.
- **User/business impact:** Failed interviews, confusion, and support escalation; raw errors can disclose infrastructure details.
- **Recommendation:** Derive a real connection status from the Stream SDK; show "Reconnecting…" with a retry, keep the interview timer visible, and map errors to user-safe messages with a support code.
- **Reference pattern:** Video-call connection quality and reconnecting banner (well-known pattern); verify exact Stream SDK events in Phase 8.
- **Effort:** M.
- **Phase 9:** Yes — 9c after Phase 8a.

### U-10 — Mobile users have no live transcript (High for mobile)

- **Screen/workflow:** Live interview room, responsive.
- **Evidence:** The transcript column is `hidden ... lg:flex` (`client/src/features/interview/room/interview-room.tsx:149`); the grid collapses to one column below `lg` (`:139`).
- **Current behavior:** On phones/tablets the transcript is removed entirely, not moved into a drawer/tab.
- **Usability problem:** Mobile candidates lose the text of the AI interviewer's questions — the only accessible fallback when audio is unclear.
- **User/business impact:** Accessibility and comprehension failure on a primary device class.
- **Recommendation:** Provide a bottom sheet or tab ("Transcript") on small screens; keep auto-scroll with a pause-on-scroll control.
- **Reference pattern:** Mobile bottom-sheet transcript (well-known pattern) — design suggestion.
- **Effort:** M.
- **Phase 9:** Yes — 9c.

### U-11 — Report evidence has no timestamps or transcript context (High)

- **Screen/workflow:** Report and evidence review.
- **Evidence:** Evidence is stored as strings (`convex/schema.ts:14-18,39`); the report renders quotes only (`client/src/app/interview/[id]/report/page.tsx:351-361`); transcript segments do carry `start`/`end` (`convex/schema.ts:122-152`) but the report never references them; the review page fetches only interview, answers, and report (`client/src/app/interview/[id]/review/page.tsx:68-76`), with no transcript query (grep for transcript/timestamp returns only copy at `:177`).
- **Current behavior:** A recruiter sees a quote but cannot jump to when it was said or inspect surrounding context.
- **Usability problem:** Evidence is unverifiable; quotes can be misread out of context. `AGENTS.md:100,155` requires evidence with timestamps and inspectable proof behind every score.
- **User/business impact:** The report is not defensible for hiring decisions; human review becomes manual copy-hunting.
- **Recommendation:** Persist segment ids and `start`/`end` with each evidence item; render timestamps; link to a transcript pane at that moment (split view on desktop, sheet on mobile).
- **Reference pattern:** Greenhouse scorecards + Metaview-style transcript-linked evidence — design suggestion.
- **Effort:** M (needs Phase 5c schema/contract).
- **Phase 9:** Yes — 9c, but **only after Phase 5c**; do not fake timestamps in the UI.

### U-12 — Review page is not an evidence-review workflow (Medium)

- **Screen/workflow:** Interview review.
- **Evidence:** `client/src/app/interview/[id]/review/page.tsx:68-76` loads interview, answers, and report; the page shows Q&A plus an "AI Feedback & Evaluation" block (`:307-316`); no transcript, criteria breakdown, or evidence timestamps.
- **Current behavior:** Review is a read-only summary of answers and narrative feedback.
- **Usability problem:** Recruiters cannot compare what was said, what was scored, and why in one place; the "AI Feedback" framing encourages taking scores as fact.
- **Recommendation:** Make this the evidence workspace: transcript with speaker/time, criteria table linking to quotes, uncertainty and human-review status. If the report page already does most of this, merge the two routes rather than duplicating.
- **Reference pattern:** Structured scorecard + transcript side-by-side (Greenhouse/Metaview public product patterns) — design suggestion.
- **Effort:** M–L.
- **Phase 9:** Yes — 9c after Phase 5.

### U-13 — Loading is spinner-only; no route-level error/loading boundaries (Medium)

- **Screen/workflow:** Global shell, dashboard, lobby.
- **Evidence:** `UserSyncProvider.tsx:136` renders a bare "Loading..."; dashboard shows a spinner for auth, redirect, and query-loading (`dashboard/page.tsx:39-63`); only `client/src/app/not-found.tsx` exists — no `error.tsx`, `global-error.tsx`, or `loading.tsx` (verified by file listing).
- **Current behavior:** Every pending state looks the same; runtime render errors fall back to the framework's default screen.
- **Usability problem:** No layout stability or perceived progress; no recovery guidance on crashes; the report page's strong state handling is not reused elsewhere.
- **Recommendation:** Add skeletons that match final layout (shell, dashboard cards/table, report), route `error.tsx` with retry, and `loading.tsx` for heavy routes; keep the report page as the reference implementation.
- **Reference pattern:** Skeleton-first dashboards (Linear/Vercel) — design suggestion.
- **Effort:** M.
- **Phase 9:** Yes — 9a (shell/error) and 9b (dashboard skeletons).

### U-14 — Required B2B screens do not exist (High, scoping blocker)

- **Screen/workflow:** Jobs & roles, candidates/pipeline, scheduling, credits/billing, settings, integrations, provider/ops.
- **Evidence:** The app routes are only those in §1; empty `admin/billing` and `api/stripe`; no tables for orgs/jobs/candidates/schedules/wallets (`convex/schema.ts`); navigation exposes only Dashboard/Interviews/Reports plus two dead links.
- **Current behavior:** The product is a single-candidate interview flow.
- **Usability problem:** `AGENTS.md:147-156` requires these workflows. Building the screens now would require mock data, which rule 9 forbids.
- **Recommendation:** Sequence honestly: Phase 2 tenancy → Phase 4 lifecycle → Phase 3 billing → then 9b/9d screens with real data. Until then, mark unavailable modules as such instead of adding nav items.
- **Reference pattern:** Ashby pipeline, Stripe billing, Vercel settings — design suggestions.
- **Effort:** L (backend first).
- **Phase 9:** Partially — 9b/9d only after their backend phases; **not safe to fake earlier**.

### U-15 — Analytics average mixes rubric versions (Medium)

- **Screen/workflow:** `/reports`.
- **Evidence:** `client/src/app/reports/page.tsx:76-84` normalizes 0–100 legacy scores and 0–10 rubric scores to a percentage; the page reads `scoreScale` but never reads or segments `rubricVersion` (`:42` and grep), so averages can span rubric revisions without a label.
- **Current behavior:** One "average score" and "best score" across all reports in a date range.
- **Usability problem:** A 0–10 rubric revision is not directly comparable to an older 0–100 evaluation; averaging hides that.
- **Recommendation:** Show rubric/version as a filter or split series, and label normalized scores as percentages; keep the CSV honest about source scale/version.
- **Reference pattern:** Stripe reporting filters by plan/period before aggregating — design suggestion.
- **Effort:** S–M.
- **Phase 9:** Yes — 9b (low risk; data already exists).

### U-16 — Theme tokens are inconsistent across surfaces (Low)

- **Screen/workflow:** Global visual system.
- **Evidence:** The live room is hardcoded dark with `bg-gray-950 text-white` (`interview-room.tsx:131,141,149`); dashboard/landing use `slate` with light/dark variants (`page.tsx:20,28,44`; `dashboard/page.tsx:84`); both gray and slate scales are used for similar surfaces.
- **Current behavior:** The room ignores the app theme; gray/slate palettes mix.
- **Usability problem:** Visual discontinuity when entering the room (expected for focus, but not tokenized); inconsistent contrast/state colors; violates the "consistent tokens" requirement.
- **Recommendation:** Define semantic tokens (surface, elevated, border, muted, success/warning/danger) in the design system; let the room use a documented focused/dark variant rather than ad-hoc grays.
- **Reference pattern:** Semantic token systems (Vercel/Linear) — design suggestion.
- **Effort:** M.
- **Phase 9:** Yes — 9a.

### U-17 — No skip link; accessibility verification is incomplete (Low)

- **Screen/workflow:** Global shell, dashboard, room.
- **Evidence:** grep for "Skip to"/skip-link found none; the only `sr-only` uses are fake landing anchors and date labels (`page.tsx:72-73`; `ExportToolbar.tsx:69,82`). Focus states are component-by-component; no global focus treatment was found.
- **Current behavior:** Keyboard users must tab through navigation on every page; no documented focus convention.
- **Usability problem:** `AGENTS.md:158` requires keyboard navigation, visible focus, and screen-reader semantics.
- **Recommendation:** Add a skip-to-content link, define a global `:focus-visible` ring, audit icon-only controls, and verify with keyboard + screen reader in a real browser run.
- **Reference pattern:** WCAG 2.2 skip-link and focus-visible guidance — design suggestion.
- **Effort:** S (implementation); M (audit).
- **Phase 9:** Yes — 9a; visual verification required in the browser run.

### U-18 — Dead billing/admin scaffolding (Low)

- **Screen/workflow:** `/admin/billing` referenced by env and docs.
- **Evidence:** `client/src/app/admin/billing` and `client/src/app/api/stripe` exist but contain no files; `.env.example:57` points to `/admin/billing`.
- **Current behavior:** The documented admin URL 404s.
- **Usability problem:** Operators following setup docs hit a dead end.
- **Recommendation:** Remove the empty dirs and env references until Phase 3/9d, or build the real view.
- **Reference pattern:** n/a.
- **Effort:** S.
- **Phase 9:** Yes — 9d/10b.

### U-19 — Duplicate Sidebar components (Low)

- **Screen/workflow:** Global shell.
- **Evidence:** `client/src/components/layout/Sidebar.tsx` and `client/src/features/components/layout/Sidebar.tsx` both exist; only the features one is imported by `DashboardLayout.tsx:7-9`.
- **Current behavior:** Two sources of truth for navigation.
- **Usability problem:** Fixing navigation in one file leaves the other stale; the dead links exist in both.
- **Recommendation:** Delete the unused copy and keep one navigation config.
- **Reference pattern:** n/a.
- **Effort:** S.
- **Phase 9:** Yes — 9a.

### U-20 — The UI regression gate is red (Medium)

- **Screen/workflow:** Test suite for lobby and JD input.
- **Evidence:** `client/test/InterviewLobby.test.tsx:98,124` expects "Start Interview" but the UI says "Start Live Interview" (`interview-lobby.tsx:217`); `:149` expects "live interview room is not configured" but the UI says "Stream video connection is unconfigured." (`:161`); `JobDescriptionInput.test.tsx:24,31,50` expect old counter copy and `border-destructive`, while the UI renders "(30 more characters needed)" and `border-red-500/80` (`JobDescriptionInput.tsx:78,184-185`).
- **Current behavior:** 6 of 223 tests fail for copy/class drift.
- **Usability problem:** Not user-visible directly, but no UI change can be validated until the baseline is green.
- **Recommendation:** Fix the assertions to the intended copy (or change the copy back intentionally), then keep tests as the UI contract for Phase 9.
- **Reference pattern:** n/a.
- **Effort:** S.
- **Phase 9:** Fix in the Phase 2 preamble, not 9a.

---

## 4. State coverage matrix

Legend: ✓ present and specific · ◐ partial/generic · ✗ absent · n/v not verified.

| Screen | Loading | Empty | Error | Disabled | Success |
|---|---|---|---|---|---|
| Landing | n/a | n/a | ✗ | n/a | n/a |
| Auth (Clerk) | Clerk | n/a | Clerk | Clerk | Clerk |
| Dashboard | ◐ spinner (`dashboard/page.tsx:39-63`) | ◐ widgets have empty copy; not verified for all | ✗ no error boundary | n/a | n/a |
| Setup | ◐ submit spinner (`setup/page.tsx:250-253`) | ◐ no resume guidance exists | ◐ JD/resume inline errors; processing failure swallowed (`:83-95`) | ✓ (`:251`) | ◐ premature toast (`:94`) |
| Lobby | ✓ checklist active states (`processing-checklist.tsx:21-29`) | ◐ no-resume description (`:35`) | ◐ error icon, no retry (`:61-63`) | ◐ start gated only on devices (`interview-lobby.tsx:131,207`) | ◐ start path |
| Live room | n/v | n/a | ✗ raw `error.message`; no reconnect (`stream-provider.tsx:162-175`) | n/a | ✗ hardcoded "Live" |
| Report | ✓ queued/processing (`report/page.tsx:614-619`) | ✓ insufficient-evidence copy (`:159-170,794`) | ✓ failed + retry + regenerate (`:529-577,655,729`) | ◐ regenerating state | ✓ |
| Review | n/v | ◐ "no evidence" copy (`review/page.tsx:177`) | ✗ no error UI found | n/a | n/a |
| Reports | n/v | n/v | n/v | n/a | n/a |
| Global shell | ◐ "Loading..." (`UserSyncProvider.tsx:136`) | n/a | ✗ no `error.tsx`/`global-error.tsx` | n/a | n/a |

The report page is the strongest state implementation in the app and should be the reference for 9a–9c.

---

## 5. Responsive and accessibility observations (code-level)

- Mobile navigation exists (`DashboardLayout.tsx:46-54` wires the sidebar drawer); this is **not** a gap.
- The live transcript is completely removed below `lg` (`interview-room.tsx:149`) — see U-10.
- `processing-checklist` uses an ordered list with `aria-label` (`:70`), which is good.
- The room timer uses `role="timer"` with `aria-live="off"`; this is reasonable (avoids per-second announcements).
- No skip link and no global focus-visible convention (U-17).
- Contrast, target sizes, and keyboard order cannot be confirmed without a browser run; left unverified.

---

## 6. Phase 9 sub-phase mapping (adjusted for findings)

| Sub-phase | Scope | Findings addressed | Dependencies |
|---|---|---|---|
| 9a | Design tokens, shell, navigation, error/loading boundaries | U-01 (shell), U-02, U-04, U-13 (shell), U-16, U-17, U-19 | None |
| 9b | Dashboard + candidate pipeline/detail | U-05, U-07 (display), U-08, U-13 (dashboard), U-15; pipeline only if backend exists | Phase 2 tenancy, Phase 4 lifecycle (pipeline) |
| 9c | Live room + transcript + report/evidence review | U-06 (retry UI), U-07, U-09, U-10, U-11, U-12 | Phase 4, Phase 5c, Phase 8a |
| 9d | Credits/billing + settings/integrations/ops | U-14 (billing/settings), U-18 | Phase 3, Phase 10a |
| 9e | Landing/marketing truthfulness | U-03 | Product decision; can be done immediately after Phase 1 approval |

**Sequencing note:** `AGENTS.md:138` allows adjusting the split. U-14 is deliberately not scheduled as UI-only work: building candidate pipelines or billing screens now would require mock production data, which the contract forbids.

---

## 7. External sources used

**None.** No web page was fetched. Reference patterns above are named as well-known interaction patterns for discussion only; they are design suggestions, not verified current capabilities or layouts. If Phase 9a needs exact public documentation (for example, Stream connection-quality events or current WCAG guidance), that research will be logged with source, URL, learning, and verification status at that time.

---

## 8. Honest summary

The strongest UI work is the report experience: real job states, rubric breakdowns, evidence, warnings, retry, and regeneration, all driven by Convex data. The weakest areas are product truthfulness and navigation: the app looks and speaks like a consumer interview-practice tool while claiming to be a B2B platform, primary navigation contains dead links and a fake search, pricing promises features that do not exist, and the live/review surfaces hide connection state and lack transport-level evidence. Before visual polish (9a), the product needs a positioning decision and honest unavailable states; before evidence workflows (9c), the report schema must carry segment timestamps (Phase 5c).
