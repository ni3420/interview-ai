# UI Redesign Brief — Interview AI

Date: 2026-11-09
Scope: steps 1–3 of the redesign remit (explore, research, audit). No application code, styles, schema, config, dependency, or env file was changed. This document is the only file written.

Relationship to earlier work: `docs/audit/ui-ux-audit.md` (2026-10-31) and `docs/design-system.md` (2026-10-28) already exist. This brief re-verifies the current tree, keeps the still-valid findings, adds design-specific findings, and proposes the visual direction and per-page treatment. Where a finding is unchanged from the earlier audit, its old ID is cited.

---

## 0. Method and limits

- Source inspection of the working tree on 2026-11-09. Paths and line references below were read in this session.
- Visual evidence: `docs/screenshots/landing-desktop.png`, `landing-desktop-dark.png`, `landing-mobile.png` were viewed. They match the current landing source.
- **Authenticated surfaces were not visually verified.** Clerk-protected routes redirect without a live session. Findings about dashboard, setup, lobby, room, report, and review are code-level.
- External research was capped and limited to public docs and product pages (see §7). No login-walled app was scraped.
- No routing, data, feature, or logic change is proposed here. Where the product has no real data for a screen, the recommendation is an honest unavailable state, not mock data.

---

## 1. Stack, verified

| Layer | What is actually used | Evidence |
|---|---|---|
| Framework | Next.js 16.4.3 (App Router), React 19.3 | `client/package.json` |
| Styling | Tailwind CSS v4 via `@import "tailwindcss"` and `@theme inline`; no `tailwind.config.*`, no `components.json` | `client/src/app/globals.css`, file listing |
| Components | Two libraries: hand-rolled shadcn-style `client/src/components/ui/*` (Radix + CVA) and custom `client/src/features/components/common/*` | `client/src/components/ui`, `client/src/features/components/common` |
| Primitives | Radix (dialog, dropdown, avatar, label, slot, toast), CVA, clsx, tailwind-merge, lucide-react | `package.json` |
| Auth | Clerk 6.39 with per-page `appearance` overrides | `app/(auth)/**`, `layout.tsx` |
| Data | Convex (source of truth), queries in pages and widgets | `client/src/convex`, `convex/schema.ts` |
| Realtime | Stream Video React SDK + agent routes | `features/interview/room/*`, `app/api/stream/*` |
| Fonts | Geist Sans + Geist Mono via `next/font` | `app/layout.tsx` |
| Feedback | Sonner toasts; `components/layout/ToasterComponent.tsx` | `layout/Providers` |
| Icons | lucide-react | imports across features |

Tables in Convex today: `users`, `interviews`, `answers`, `transcriptSegments`, `resumes`, `reports`, `rateLimits`, `reportJobs` (`convex/schema.ts:75–214`). There is no jobs, candidates, organizations, wallets, or ledger table.

---

## 2. Page and route inventory

| # | Route | File(s) | Purpose | Data source | Layout | Verified state |
|---|---|---|---|---|---|---|
| 1 | `/` | `app/page.tsx`, `features/components/landing/{HeroSection,FeatureGrid,PricingSection}.tsx` | Marketing landing | static copy + fabricated preview cards | single centered column, sticky header | live, screenshot-verified |
| 2 | `/sign-in` | `app/(auth)/sign-in/[[...sign-in]]/page.tsx` | Clerk sign-in | Clerk | centered card, glow background | code-verified |
| 3 | `/sign-up` | `app/(auth)/sign-up/[[...sign-up]]/page.tsx` | Clerk sign-up + email-in-use notice | Clerk | centered card, glow background | code-verified |
| 4 | `/dashboard` | `app/dashboard/page.tsx` | Overview: stats, interviews table, today list, notes | `api.interviews.getInterviews` | `DashboardLayout` + sidebar/navbar; 2/3 + 1/3 grid | code-verified |
| 5 | `/interview/setup` | `app/interview/setup/page.tsx`, `ResumeUpload`, `JobDescriptionInput` | Create interview: resume, JD, duration | Convex mutation + `/api/resume/process` | centered card on glowed page, 3-step form, 3 feature cards | code-verified |
| 6 | `/interview/[id]/lobby` | `app/interview/[id]/lobby/page.tsx`, `features/interview/lobby/*` | Device check + readiness + start | Convex resume/interview; `/api/stream/token` | two-column: preview + progress card | code-verified |
| 7 | `/interview/[id]` | `app/interview/[id]/page.tsx`, `features/interview/room/*` | Live AI video interview | Stream + Convex answers/segments | full-screen dark, stage + 400px transcript | code-verified |
| 8 | `/interview/[id]/report` | `app/interview/[id]/report/page.tsx` (972 lines) | Report states, rubric, evidence, regenerate | `getReport`, `getReportJob` | long card stack, max-width container | code-verified |
| 9 | `/interview/[id]/review` | `app/interview/[id]/review/page.tsx` | Q&A + narrative feedback | interviews, answers, reports | max-w-4xl card list | code-verified |
| 10 | `/reports` | `app/reports/page.tsx` | Cross-interview analytics + CSV | `getUserReports`, `getInterviews` | metric grid, toolbar, chart, table/mobile cards | code-verified |
| 11 | `*` | `app/not-found.tsx` | 404 | static | centered, gradient text, glows | code-verified |
| 12 | `/e2e/room-harness` | `app/e2e/room-harness/page.tsx` | Test harness | test data | n/a | not product UI |

Missing routes required by the repo contract: Jobs & Roles, Candidates/pipeline, Interviews list, Settings, Team, Integrations, Credits & Billing, Provider/ops (AGENTS.md Phase 9). Navigation currently links to `/history` and `/settings`, neither of which exists.

### Shared components

| Group | Files | Notes |
|---|---|---|
| UI kit | `components/ui/{avatar,badge,button,card,dropdown-menu,input,label,progress,separator,textarea}.tsx` | shadcn-style; `button` variants `default/outline/ghost/...` |
| Feature kit | `features/components/common/{Badge,Button,Card,Toggle}.tsx` | different APIs (`variant="primary"`, `leftIcon`, `interactive`, `status`) |
| Layout | `components/layout/{DashboardLayout,Providers,RequireSyncedUser,UserSyncProvider,ClerkClientProvider,ConvexClientProvider,ThemeProvider,ToasterComponent}.tsx`; `features/components/layout/{Sidebar,Navbar,Header}.tsx` | `components/layout/Sidebar.tsx` is an unused duplicate |
| Dashboard | `StatsOverview`, `TaskTable`, `ScheduleWidget`, `NotesWidget` | one component per widget |
| Landing | `HeroSection`, `FeatureGrid`, `PricingSection` | no FAQ, proof band, or product evidence |
| Interview | setup inputs, lobby (preview/checklist), room (stage, transcript, timer, recorder) | room is the only hardcoded-dark surface |
| Reports | `MetricSummaryCard`, `AnalyticsChart`, `ExportToolbar` | chart is custom SVG/div based |

---

## 3. Findings that block a redesign

### P-01 — Positioning is unresolved (Blocker)

The repo contract says B2B SaaS for AI voice interviews (`AGENTS.md:2`). The implemented product is candidate interview practice: "Practice, prep, and ace your AI interviews", "Set Up AI Mock Interview", "Track your interview prep", "Start Mock Interview", candidate pricing. The same product cannot present both. Every page's copy, IA, and primary action depend on this choice. Existing audit U-01 remains valid.

### P-02 — Pricing promises a product that does not exist (Blocker for launch)

`PricingSection.tsx:22–60` sells 3/month, unlimited, shared candidate workspace and role-based access. There is no billing, wallet, or entitlement table (`convex/schema.ts`), and all three CTAs go to `/sign-up`. Existing audit U-03 remains valid. Any redesign must either mark plans unavailable or defer the pricing section until Phase 3.

### P-03 — Two competing component systems (High)

The same concepts exist twice with different props and variants. Example: report page imports `components/ui/card` and `components/ui/badge`; review page imports `features/components/common/Card` and `Badge`. Button variants differ (`default` vs `primary`). Fixing a token or state in one leaves the other stale. A redesign must pick one library and retire the other.

### P-04 — The design system is specified but not applied (High)

`docs/design-system.md` defines an editorial system, but `globals.css` contains only the default violet/neutral shadcn tokens, and the landing has no `.landing-editorial` scope. There is no type scale, no spacing scale, no motion tokens, no elevation tokens, and no sidebar token group. Existing audit U-16 remains valid.

### P-05 — No honest state model for unavailable modules (High)

Navigation exposes dead links (`/history`, `/settings`), the navbar search filters nothing, notifications are always empty, and "New Project" duplicates "New Interview". Existing audit U-02 remains valid and is a design-system problem: nav must be generated from routes that exist.

---

## 4. Per-page audit

Legend: severity is about user impact, not effort.

### 4.1 Landing `/` — severity High

| Issue | Evidence | Impact |
|---|---|---|
| Generic centered SaaS composition: eyebrow icon, centered H1, two equal CTAs, 6 equal feature cards, 3 pricing cards | `page.tsx`, `HeroSection.tsx`, `FeatureGrid.tsx` | No product evidence; indistinguishable from an AI template; contradicts "must not read as AI-generated" (AGENTS.md Phase 9) |
| Decorative AI signals: Sparkles brand mark, radial violet glow, colored gradient 404 | `page.tsx:4,22–24,32`; `HeroSection.tsx` | Violates explicit no-sparkle / no-gradient rule |
| Fabricated proof: "Confidence score 92%", "98% Fit", "Technical accuracy up 12% this week", "Upcoming Session" card | `HeroSection.tsx` floating cards | Claims data the product does not produce; AGENTS.md rule 9 |
| Two equal primary actions (`Start Free Mock Interview`, `Sign In`) and a redundant header CTA | `HeroSection.tsx` | Weak hierarchy; no single conversion action |
| Dead navigation: `#solutions`, `#how-it-works` are `sr-only` divs; pricing nav only | `page.tsx:11–16,72–73` | Clicking goes nowhere (U-02) |
| "No credit card required" while no billing exists | `HeroSection.tsx` | Misleading |
| Typography: system weight 800 hero, `text-3xl/5xl/6xl`, no display scale; no serif or distinctive voice | `HeroSection.tsx:143` | Generic; no brand character |
| Mobile: hero is 2 screens tall; floating cards hidden below xl; feature grid stacks 6 cards | screenshot `landing-mobile.png` | Long scroll before pricing; no product visual on mobile |

### 4.2 Auth `/sign-in`, `/sign-up` — severity Medium

| Issue | Evidence | Impact |
|---|---|---|
| Candidate-only copy ("continue your AI interview preparation") | both pages | Contradicts B2B positioning (P-01) |
| Sparkle tile + two radial/blur glows | `sign-in/page.tsx`, `sign-up/page.tsx` | Decorative AI cliché; forbidden |
| Heavy Clerk appearance overrides with 10–11px labels and custom radii | `appearance.elements` | Fragile, inconsistent with app type scale; low legibility |
| Terms/Privacy are plain text, not links | footer paragraph | Looks like a legal promise that cannot be opened |
| Success/error surfaces: only an email-in-use alert exists | `EmailInUseNotice` | No general auth error styling |

### 4.3 Dashboard `/dashboard` — severity High

| Issue | Evidence | Impact |
|---|---|---|
| "Time Saved" is `completed × 15` minutes, labeled as data | `StatsOverview.tsx:12,52,63` | Fabricated metric (U-05) |
| Notes widget ships three default notes | `NotesWidget.tsx:20–24` | Mock production content in a real product |
| "Today's Schedule" is derived from interview creation time, not scheduled sessions | `ScheduleWidget.tsx:55–83` | Implies scheduling that does not exist |
| Three equal stat cards, each with a colored icon tile; three accent colors | `StatsOverview.tsx:60–85` | Decorative color, no data hierarchy |
| Page title is `text-2xl/3xl font-semibold`, subtitle is slate-500 | `dashboard/page.tsx:85` | Inconsistent with reports/setup/review headings |
| Table mixes dates, status, action, and a fake avatar stack | `TaskTable.tsx:163–174` | Avatar cluster implies multiple participants that do not exist |
| Loading is a bare spinner; no skeleton; no error boundary | `dashboard/page.tsx:39–63`; no `app/error.tsx` | Layout jump, no recovery (U-13) |
| Sidebar: sparkle logo, 5 nav items incl. 2 dead links, recent sessions, footer profile | `features/.../Sidebar.tsx` | Dead ends; brand cliché |
| Navbar: non-functional search, empty bell, "New Project" | `Navbar.tsx:100–190` | Three fake controls (U-02) |

### 4.4 Interview setup `/interview/setup` — severity High

| Issue | Evidence | Impact |
|---|---|---|
| Success toast + navigation happen even when `/api/resume/process` returns non-2xx | `page.tsx:83–95` | False success; lobby waits forever (U-06) |
| Candidate wording ("Set Up AI Mock Interview", "Start Mock Interview") | `page.tsx:132,260` | Positioning mismatch |
| Sparkle tile + glow + 3 feature cards below the form | `page.tsx:129,260,275` | Decoration after the task is done; adds scroll |
| Form is one card with numbered steps; no sticky summary of selected file/duration | `page.tsx:150–250` | On long JD the primary action is far from context |
| Counter copy "…/50 min characters" is awkward | `page.tsx:196` | Unclear requirement |
| Duration buttons are custom, not the shared button/segmented control | `page.tsx:210–235` | Another control style to maintain |
| No page-level skeleton beyond a generic block; no error route | `setup/loading.tsx` | Acceptable but inconsistent |

### 4.5 Lobby `/interview/[id]/lobby` — severity High

| Issue | Evidence | Impact |
|---|---|---|
| Start is gated on Stream/device readiness, not `resumeStatus === "ready"` | `interview-lobby.tsx:131` | Interview can start with no questions (U-07) |
| Failed resume step has no retry control | `processing-checklist.tsx:61–63` | Dead end (U-06/U-07) |
| "Agent Active" and pulsing dot show regardless of readiness | `interview-lobby.tsx:23–59` | Fake live state |
| Lobby queries newest resume, not `interview.resumeId` | `lobby/page.tsx:33` | Wrong file status (U-08) |
| Sparkle eyebrow, glow, many card surfaces, 10–11px labels | files above | Visual noise around a simple checklist |
| Header is `text-2xl/3xl font-extrabold` | `interview-lobby.tsx` | Inconsistent weight |

### 4.6 Live room `/interview/[id]` — severity High

| Issue | Evidence | Impact |
|---|---|---|
| Hardcoded dark `bg-gray-950` and `gray-*`; ignores theme tokens | `interview-room.tsx:131,141,149` | Discontinuity; not tokenized |
| "Live" badge always green and pulsing; no connection state | `interview-room.tsx:85–90` | Cannot tell healthy from dropped (U-09) |
| Transcript column `hidden ... lg:flex`; no mobile alternative | `interview-room.tsx:149` | Mobile loses the only accessible question fallback (U-10) |
| Provider errors render raw `error.message` | `stream-provider.tsx:162–175` | Leaks internals, no recovery (U-09) |
| Timer, participant count, Live, End all in one dense header row | `interview-room.tsx:75–115` | Crowded on tablet; End is easy to hit |
| No progress indicator (question n of m) | room components | Candidate cannot judge progress |
| "Transcript saving is failing" is good, but sits between header and stage | `interview-room.tsx:120–128` | Correct content, weak placement |

### 4.7 Report `/interview/[id]/report` — severity Medium (strongest page)

| Issue | Evidence | Impact |
|---|---|---|
| 972-line single component | file size | Hard to restyle or test; high regression risk |
| Evidence is quotes only; no timestamps or transcript context | `report/page.tsx:351–361`; schema stores segments with `start/end` | Not defensible (U-11) |
| `text-[11px]` uppercase labels repeated for every block | `:294,310,324,335,344,353` | Visual monotony; tiny type |
| Score presented as a large number without uncertainty/version beside it | rubric cards | Invites treating a model output as fact |
| Regenerate/retry states exist and are good; loading/empty/error all covered | `:529–577,614–619,655,729` | Keep this pattern as the reference |

### 4.8 Review `/interview/[id]/review` — severity Medium

| Issue | Evidence | Impact |
|---|---|---|
| Duplicates the report surface with different styling | `review/page.tsx` | Two sources of truth for one job (U-12) |
| No transcript, criteria table, or evidence timestamps | `:68–76` | Cannot verify a score |
| "AI Feedback & Evaluation" with Sparkles, violet tinted box | `:307–316` | Decorative AI framing |
| Heading `text-2xl/3xl font-extrabold`, 11px uppercase labels | `:118,140` | Inconsistent scale |
| No loading skeleton, no error UI for the report query | `:76–90` | Partial state handling |

### 4.9 Reports `/reports` — severity Medium

| Issue | Evidence | Impact |
|---|---|---|
| Four metric cards with four different accent colors | `reports/page.tsx:200–235` | Color carries no meaning |
| Averages normalize score scales but do not expose rubric version | `:76–84`; normalization label exists | Better than before; still not auditable (U-15) |
| Chart is a custom component with no axis labels/units | `AnalyticsChart.tsx` | "Percent" is only in the description |
| Table and mobile card list duplicate the same markup | `reports/page.tsx:250–330` | Maintenance cost; easy to drift |
| Heading `text-xl/3xl font-extrabold` vs dashboard `2xl/3xl font-semibold` | `:190` | Inconsistent hierarchy |
| Excellent empty state and CSV toolbar | `ExportToolbar`, empty block | Keep |

### 4.10 Not found — severity Low

Gradient text, two blur glows, Sparkles quick link, Badge with playful copy. Violates the visual rules but is low-traffic. Keep the helpful quick links; remove the decoration.

### 4.11 Cross-cutting

| Issue | Evidence | Impact |
|---|---|---|
| Type scale drift: `extrabold` on 9 files, semibold on dashboard, `text-[10px]/[11px]` everywhere | grep results | No reliable hierarchy |
| Mixed neutrals: `slate-*`, `zinc-*`, `gray-*` | grep results | Inconsistent surfaces and borders |
| Radius mix: `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl` for peer elements | components | No shape language |
| Spacing mix: `gap-4/6`, `p-4/5/6/8`, `py-16` | components | Uneven rhythm |
| No skip link; focus rings only on some controls | grep for "Skip to" → none | Accessibility gap (U-17) |
| No `error.tsx`, `global-error.tsx`; only three `loading.tsx` | file listing | Crash and loading gaps (U-13) |
| Toasts fire before commit in setup; copy inconsistent | `setup/page.tsx:94` | Trust failure (U-06, design-system §11) |

---

## 5. Recommended direction

### 5.1 Recommendation: one system, two densities

Build one token system and one component library. Use a **neutral operator surface** for the authenticated product and a **document-style marketing surface** that shares the same type and spacing scale but permits a display serif. This resolves the "editorial vs app" split in `docs/design-system.md` without maintaining two identities.

Why: the product's job is evidence review and operational status. Neutral surfaces, one signal accent, and typographic hierarchy fit that job better than violet AI branding. A serif is justified on marketing and report headlines only; it should never enter forms, tables, or controls.

If brand continuity matters more, the same system can carry the existing violet as the accent. The structure does not change; only one token value does.

### 5.2 Proposed tokens (starting point, not final)

| Category | Proposal |
|---|---|
| Canvas | Light `#FAFAF9` (warm off-white) / dark `#0C0C0D`; card light `#FFFFFF` / dark `#141416` |
| Text | Ink `#18181B` / `#F4F4F5`; muted `#71717A` / `#A1A1AA` |
| Accent | One action color only (proposal: deep indigo `#4338CA` light, `#818CF8` dark, or keep violet) |
| Semantic | success `#15803D`/`#4ADE80`; warning `#B45309`/`#FBBF24`; danger `#B91C1C`/`#F87171`; info/evidence blue `#1D4ED8`/`#93C5FD` |
| Type | UI: Geist Sans. Marketing/report display: Georgia/serif. Numbers: Geist Mono, tabular. Scale 11/12/13/14/16/20/24/30/40/56 across roles, weight 400/500/600 only |
| Spacing | 4px base; component gaps 8/12/16; section rhythm 48 mobile / 64 desktop |
| Radius | 6px controls, 10px surfaces, 999px status only. No `rounded-2xl/3xl` cards |
| Elevation | 1px border + one soft shadow tier; no glass, no glow |
| Motion | 120ms controls, 180ms overlays, ease-out; respects `prefers-reduced-motion` |
| Grid | Product: 12-col, 24px gutters, max 1280. Marketing: 1180, 12-col, asymmetric hero. Prose 68ch |

### 5.3 Per-page treatment (suggestions, not yet implemented)

| Page | Direction | Concrete moves |
|---|---|---|
| Landing | Product evidence, not abstraction | Replace centered hero with asymmetric 6/5 split: concrete promise + one CTA on the left, a real room/transcript/report frame on the right (built from actual components, not fake stats). Remove floating fabricated cards, glow, sparkles. Numbered capability index with rules, not six equal cards. Keep pricing only when billing exists; otherwise a single "Plans are not available yet" band. Add FAQ as native `<details>`. |
| Auth | Quiet and confident | Remove sparkles/glows; one sentence of product context; let Clerk render its own accessible form with only color/radius overrides; real Terms/Privacy links or remove the line. |
| Dashboard | Operator overview | Header row with title + one primary action. A compact stat strip (4 metrics, no icon tiles) sourced from real timestamps. Interviews table as the primary object with status, role, duration, report state, and one row action. Remove fake schedule and default notes; if notes stay, start empty. Skeletons that mirror the table. |
| Setup | Two-pane task | Left: steps (resume, role, duration). Right: sticky summary with selected fileName, character count, duration, and one submit. Remove the three feature cards. Use the shared segmented control. Treat processing failure as a blocking inline error with Retry. |
| Lobby | Readiness, honestly | One status list: resume parsed → questions generated → devices ready → agent ready. Each row has state, explanation, and retry where possible. Gate Start on questions ready. Remove "Agent Active" until true. Device preview stays, but chrome is reduced. |
| Room | Calm focus | Tokenized dark variant (documented, not ad-hoc gray). Header: role, question progress, timer; connection status derived from the SDK (Live/Reconnecting/Offline) with retry. Transcript visible on mobile as a sheet/tab. Errors mapped to human copy + support code. End is a secondary/danger action with confirmation. |
| Report | Evidence workspace | Split view on desktop: report summary and scores on the left, transcript/evidence on the right; clicking a score scrolls/highlights its quote and timestamp. Persist segment ids and timestamps first (Phase 5c); do not fake them. Show rubric version, uncertainty, and "decision support" language. Break the 972-line page into report sections. |
| Review | Merge or differentiate | Either merge with report or make it the human-review workspace: transcript + criteria + reviewer notes. Remove the "AI Feedback" framed box; label it "Model assessment". |
| Reports | Auditable analytics | One accent for data; neutral metric strip; chart with axis, unit, and rubric-version filter; single responsive table pattern. Keep CSV and empty state. |
| 404 | Utility | Remove gradient/glow; keep the two useful destinations. |
| Shell | One navigation source | Delete the unused `components/layout/Sidebar.tsx`; generate nav from existing routes; replace fake search with a real command palette scoped to interviews/reports, or remove it; notifications only when a real feed exists; rename "New Project" to "New interview". Add skip link and one global focus-visible ring. |

---

## 6. Implementation sequence (per repo contract: ≤8 files per sub-phase)

| Step | Scope | Files (target) | Depends on |
|---|---|---|---|
| 9a | Tokens, typography, one component library, shell, nav, focus, skip link | `globals.css`, `components/ui/*` (button, card, badge, input), `DashboardLayout`, `Sidebar`, `Navbar`, `layout.tsx` | Direction approval |
| 9a-2 | Marketing surface | `page.tsx`, `HeroSection`, `FeatureGrid`, `PricingSection`, new `ProofBand`/`FaqSection` | 9a |
| 9b | Dashboard + setup + lobby states | dashboard page, `StatsOverview`, `TaskTable`, setup page, lobby | 9a; positioning decision |
| 9c | Room + report + review | room shell, transcript panel, report sections, review | Phase 5c for timestamps |
| 9d | Reports + 404 + settings/billing (only if backend exists) | reports page, not-found, future settings | Phase 3 for billing |

Do not build billing, pipeline, settings, or team screens on mock data. Mark unavailable modules as unavailable until their backend phase ships.

---

## 7. Research log

| Source | URL | What was learned | Where it applies | Status |
|---|---|---|---|---|
| shadcn/ui — Theming | https://ui.shadcn.com/docs/theming | Semantic `background`/`foreground` token pairs; one `--radius` derives the whole radius scale; dedicated `sidebar-*` tokens | Token architecture in §5.2; sidebar theming | Verified doc |
| Vercel Geist — Typography | https://vercel.com/geist/typography | Role-based scale (heading/copy/label/button); default button text 14; mono for tabular numbers and code; separate label vs copy line-heights | Type scale and numeric treatment in §5.2 | Verified doc |
| W3C WAI — WCAG 2.2 SC 2.4.13 Focus Appearance | https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html | Focus indicator must cover at least a 2px perimeter and change contrast by ≥3:1; offset outlines help visibility | Global focus ring, nav, controls | Verified standard |
| Stripe — Subscriptions overview | https://stripe.com/docs/billing/subscriptions/overview | Explicit lifecycle statuses (`incomplete`, `active`, `past_due`, `unpaid`, `canceled`); provision access only when status/entitlement is active; failed-payment recovery is a UI requirement | Future billing screens; do not show payment success before backend confirmation | Verified doc |
| Metaview | https://www.metaview.ai/ | Public positioning around transcript-linked evidence, scorecards, shared workspace, audit trail of AI reasoning, human guardrails | Report/review evidence workspace framing | Verified public page (marketing claims, not UI inspection) |
| Linear Method | https://linear.app/method | Product/process principles (small scope, momentum, quality); no visual layout specifics | Process discipline for the redesign, not visual rules | Verified page; no UI claims |
| Ashby analytics page | https://www.ashbyhq.com/product/analytics | Request returned 404 | Not used | Failed |

No claim above is based on an authenticated screen. Reference patterns (dense tables, command menus, evidence panes) are **design suggestions**, not verified capabilities of those products.

---

## 8. What needs your decision before implementation

1. Positioning: candidate practice tool, B2B recruiting platform, or both (two clearly separated surfaces).
2. Visual direction: neutral operator (recommended), editorial signal-red as specified in `docs/design-system.md`, or keep violet with a strict cleanup.
3. First implementation slice: shell + tokens + landing first, or tokens + shell only, then land page by page.
4. Billing: remove pricing now, or mark it unavailable until Phase 3.

No application code will change until these are answered.

---

## 9. Decisions received (2026-11-09)

- Positioning: **B2B recruiting platform**. Copy and IA will use recruiter/hiring-team vocabulary; the candidate-practice wording is now a defect to remove.
- Direction: **Neutral operator**. Ink/paper surfaces, one indigo action accent (`#4338CA` / `#818CF8` dark), Geist only in product; no glow, glass, sparkles, or gradient text.
- Scope: **Full 9a, step by step**. 9a executed below; 9a-2 (landing) not started.

## 10. Sub-phase 9a — executed

### Files changed (9 total, all under `client/src`)

| File | Change |
|---|---|
| `app/globals.css` | Replaced violet theme with neutral operator tokens: paper/ink canvas, card/popover, indigo primary, success/warning/info semantics, `sidebar-*` group, 10px radius. Added type roles (`display`, `title`, `heading`, `body`, `label`, `caption`, `micro`), `ease-out-quart`, global `:focus-visible` outline, heading weight/text-wrap defaults, selection color, reduced-motion reset. |
| `components/ui/button.tsx` | Canonical kit. Denser sizes (h-9 / h-8 / h-10 / icon), one accent, token colors, `ease-out-quart`, consistent SVG sizing. Variant names unchanged. |
| `components/ui/card.tsx` | Token border/shadow (`shadow-xs`), `radius-lg` = 10px, `text-heading` title, `text-label` description, p-5 rhythm. |
| `components/ui/badge.tsx` | Added `neutral`, `warning`, `info`; token-tinted variants; 11px/medium; exports `BadgeVariant`/`BadgeProps`. |
| `components/layout/DashboardLayout.tsx` | Skip link to `#main-content`, focusable `<main>`, token background, tighter page padding. |
| `features/components/layout/Sidebar.tsx` | Nav reduced to real routes only (Dashboard, New interview, Reports). Removed dead `/history`, `/settings`, Sparkles brand mark, glass/backdrop-blur, dot indicator. Added `aria-current`, `aria-label="Main"`, monogram mark, token `sidebar-*` styling, "Recent interviews" label, "Team member"/"Signed in" fallbacks. |
| `features/components/layout/Navbar.tsx` | Removed non-functional search, notification bell, and `⌘F` listener. Removed the "New Project" dropdown; one primary "New interview" action. Title derived from pathname. `h-14` to match sidebar. Token styling. |
| `components/layout/Sidebar.tsx` | **Deleted** — unused duplicate of the feature sidebar. |
| `features/components/layout/Header.tsx` | **Deleted** — unused duplicate of Navbar that imported a removed type. |

Deviations from the planned 8-file slice: two deletions were required for a clean build (the duplicate header did not compile against the new Navbar API; the duplicate layout sidebar was unreferenced). No other files touched.

### Verification (run, not inferred)

```
node node_modules/typescript/bin/tsc --noEmit   -> exit 0, no output
npm run lint                                    -> 0 errors, 9 pre-existing unused-import warnings
                                                   (lobby, setup, JobDescriptionInput, interview-lobby,
                                                    interview-room, stream-provider; none in 9a files)
npm run build                                   -> compiled successfully, 12/12 static pages, all routes built
```

Compiled CSS check (`.next/static/chunks/*.css`): `text-micro`, `text-heading`, `ease-out-quart`, `bg-sidebar`, `shadow-xs` all present, so the new tokens generate real utilities.

Not verified visually: `/dashboard` and every other authenticated route requires a Clerk session. The shell was validated by types, lint, build, and compiled-CSS inspection only.

### Known follow-ups inside 9a, not done

- `components/ui/input.tsx`, `textarea.tsx`, `label.tsx`, `progress.tsx`, `separator.tsx`, `dropdown-menu.tsx` still use the old ring/radius rhythm. Align in 9b with the input work.
- `features/components/common/{Button,Card,Badge}` remain the second kit used by 27 imports (landing, dashboard, reports, review). Canonical is now `components/ui/*`; migration happens per page in 9a-2/9b/9c. No file should add new `common/*` imports.
- Landing, auth, dashboard bodies are unchanged and still contain candidate copy, sparkles, and fabricated metrics. Those are 9a-2 and 9b.
- `Navbar` no longer accepts `title`/`notifications`; nothing referenced them after the dead files were deleted.

## 11. User-sync loading states — executed (2026-11-09)

Request: redesign the state shown while the app determines sign-in and syncs the account.

| File | Change |
|---|---|
| `components/layout/UserSyncProvider.tsx` | Exposes `stage` (`clerk` → `identity` → `profile`) beside `status`. Public routes (`/`, `/sign-in`, `/sign-up`) now render immediately instead of flashing a full-screen "Loading..."; protected routes get `<AppBootSkeleton />`. |
| `components/layout/AppBootSkeleton.tsx` | **New.** Shell-shaped skeleton (sidebar rail, header, metric cards, table) matching `DashboardLayout` geometry, plus `ContentSkeleton` for Suspense boundaries. `role="status"` + sr-only "Loading workspace". |
| `components/layout/RequireSyncedUser.tsx` | Replaced the spinner with a staged panel: wordmark, "Preparing your workspace", three steps (Verify session / Confirm profile / Load workspace) with Done/Working/Waiting states. Signed-out gets an explicit "Go to sign in" fallback; error and 10s stall get a bordered notice and Retry; email-taken links to sign up instead of retrying. |
| `app/interview/layout.tsx` | Raw border-spinner Suspense fallback replaced with `ContentSkeleton`. |

Verification: `tsc --noEmit` clean; `eslint` 0 errors (same 9 pre-existing warnings); `next build` succeeds for all 17 routes.

Not verified: the panel and skeleton were not seen rendered in a browser — they only appear behind Clerk auth and no signed-in session was available. Source-level and build validation only.

## 12. Sign-in / sign-up — executed (2026-11-09)

Request: redesign the sign-in page. Sign-up was rebuilt in the same slice because both pages shared one template and leaving it on the old violet/glow design would have split the pair.

| File | Change |
|---|---|
| `features/components/auth/AuthShell.tsx` | **New.** Two-column auth layout: brand row (monogram + wordmark, "Back to site"), 380px form column with `h1`, description, Clerk slot, legal line; 460px bordered panel at `lg` with one factual statement and three true capability notes (room, transcript, report). No glow, sparkle, gradient, testimonial, or metric. |
| `features/components/auth/clerkAppearance.ts` | **New.** Shared Clerk element classes plus light/dark `variables` bound to the app theme via `next-themes` (`useAuthAppearance`), so the embedded card follows dark mode and the submit button uses the indigo action color instead of Clerk's default black. |
| `app/(auth)/sign-in/[[...sign-in]]/page.tsx` | Replaced candidate copy, Sparkles tile, and radial glows with `AuthShell` + Clerk appearance. Copy: "Sign in" / "Continue to your interview workspace." |
| `app/(auth)/sign-up/[[...sign-up]]/page.tsx` | Same shell; restyled email-in-use alert on tokens; keeps the `?reason=email-taken` behavior. |

Verified in a real browser at 1440x900 and 390x844, light and dark, plus `/sign-up?reason=email-taken`:
- Primary button renders `#4338CA` light / `#818CF8` dark (computed `rgb(129,140,248)` on the footer link in dark).
- Clerk card, inputs, and social-button labels follow dark mode; labels computed `#F4F4F5`.
- Both themes pass `tsc`, `eslint` (0 errors), and `next build`.

Notes: the hatched "Development mode" strip is Clerk's dev-only footer and will not appear in production. Legal text is not linked because no Terms/Privacy routes exist yet.

Temporary artifacts written outside the repo (for screenshots): `%TEMP%\opencode\shoot.js`, `shoot-dark.js`, `shoot-signup.js`, `probe.js`, and PNGs `signin-desktop.png`, `signin-mobile.png`, `signin-desktop-dark.png`, `signin-mobile-dark.png`, `signup-desktop.png`, `signup-email-taken.png`.
