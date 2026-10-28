# Interview AI — UI Design System

> Status 2026-10-28: this document is the **agreed specification**. No page in the
> working tree implements it yet — the landing implementation authored this session was
> reverted with the rest of the code tree, and `client/src/app/globals.css` contains no
> `.landing-editorial` scope. Re-apply §2–§7 on the landing page before claiming
> conformance; §12 defines the order for everything else.
> Source of truth for values once applied: `client/src/app/globals.css`.
> Scope and rationale: `docs/decisions/0001-editorial-design-system.md`.

## 1. Direction

Editorial launch system with signal red.

The page should read like a well-set product document: a real promise, real product
evidence, numbered sections, thin rules, and one conversion action per section.
Typography and asymmetry carry the design; decoration does not.

Principles, in priority order:

1. State one concrete promise.
2. Show product evidence in the first viewport.
3. One primary conversion action per section.
4. Vary density: spacious promise → compact proof → medium narrative → compact metrics → decisive close.
5. Proof before the claim.
6. No gradients, glassmorphism, floating pills, or AI sparkle decoration.

## 2. Surfaces and token scope

| Surface | Class scope | Tokens | Status |
|---|---|---|---|
| Marketing (`/`) | `.landing-editorial` | warm paper / signal red / evidence blue | specified, to re-apply |
| Product (app shell) | `:root` + `.dark` | neutral / violet | unchanged |
| Auth (`/sign-in`, `/sign-up`) | `:root` | neutral / violet | pending |

Rules:

- Never apply `.landing-editorial` to an authenticated page.
- Never use `--primary` (violet) inside the editorial scope; the scope redefines it.
- Dark mode uses the same class list: `<html class="dark">` + `.landing-editorial`.
- Promoting the palette app-wide is a separate decision (see §12) and requires removing
  the scope in the same change, not layering a third variant.

## 3. Color

### Marketing (`.landing-editorial`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#F3F0E8` | `#14130F` | page canvas (warm paper) |
| `--card` | `#FFFDF7` | `#1C1A15` | product media, metric band |
| `--foreground` | `#171714` | `#F5F2EA` | headlines and body |
| `--muted-foreground` | `#646158` | `#B3ADA0` | supporting copy, labels |
| `--primary` | `#C93625` | `#FF6A52` | primary CTA, primary marker |
| `--primary-foreground` | `#FFFDF7` | `#14130F` | text on primary |
| `--border` | `#D8D2C6` | `#2E2B24` | rules, frames |
| `--muted` | `#EAE5D9` | `#26231C` | chips, inset surfaces |
| `--signal` | `#C93625` | `#FF826D` | section numbers, LIVE, progress |
| `--evidence` | `#3157D5` | `#8CA2FF` | metrics, check marks, data proof |
| `--success` | `#2E7D4F` | `#5BBE8B` | status dot |
| `--ring` | `#3157D5` | `#8CA2FF` | focus ring |

Why `#C93625` and not the reference `#F04D35`: `#F04D35` on paper is ≈ 2.9:1, which
fails AA for the 13px CTA label. `#C93625` on `#FFFDF7` is ≈ 5.2:1. `#F04D35` may be
used as a decorative accent only (never for text under 18.66px bold).
`globals.css` currently defines no `--signal` at all; `#C93625`/`#FF826D` exist only in
this document until the landing scope is applied. If the palette is promoted, add
`--signal` to `:root` in that same change.

### Product (unchanged, for reference)

Violet `#7c3aed` light / `#a78bfa` dark on neutral white `#ffffff` / charcoal `#0a0a0a`.
Do not mix these into the editorial scope.

## 4. Typography

| Role | Family | Size / line / weight / tracking |
|---|---|---|
| Hero display | Georgia, "Times New Roman", serif | 42 → 52 → 64px / 0.98 / 500 / -0.025em |
| Section display | serif | 30 → 40px / 1.02 / 500 / -0.018em |
| Plan price | serif | 40px / 1 / 500 / -0.03em, tabular |
| Hero lede | Geist Sans | 17px / 1.55 / 400 |
| Body | Geist Sans | 15px / 1.6 / 400 |
| Dense body | Geist Sans | 13.5px / 1.6 / 400 |
| UI label | Geist Sans | 13px / 1.2 / 600–700 |
| Eyebrow | Geist Sans | 11px / 1.2 / 700 / 0.12em uppercase |
| Micro label | Geist Sans | 9–10.5px / 1.2 / 700 / 0.12em uppercase |
| Metadata / numbers | Geist Mono | 10.5–11px / 1.4 / 600, tabular |
| Metric value | Geist Mono | 30px / 1 / 600 / -0.02em |

Rules:

- Serif is for display only: hero, section headings, prices, quote-like copy. Never for body or UI.
- Mono is for numbers, timers, counts, section indices. Never for prose.
- No size outside this table without adding it here first.
- Do not use `font-extrabold`; display weight is 500, UI weight is 600–700.

## 5. Layout

- Container: `max-w-[1180px]`, gutters 20px mobile / 32px ≥ 640px.
- Desktop grid: 12 columns, 32px gap. Hero: copy 6 cols, evidence 5 cols starting at col 8.
- Section rhythm: 56px mobile / 64px desktop vertical padding; hero 56/72.
- Document width for prose: 58–68ch.
- Radii: media 10px, controls 6px (`rounded-md`), inner chips 5px, meters 2px.
- Rules: 1px `--border` between rows; a 1px `--foreground` rule opens the pricing grid
  and the final CTA.
- No cards for layout. Only the product media frame and the metric band use a surface.

## 6. Components

Target component layout. `FaqSection.tsx` and `ProofBand.tsx` do not exist yet; the other
files exist but currently hold the previous design.

| Component | File | Rules |
|---|---|---|
| Header | `src/app/page.tsx` | wordmark = 3px signal rule + serif logotype; no icon tile; links 13px/600; status label 11px; one CTA |
| Hero | `landing/HeroSection.tsx` | eyebrow, serif H1, ≤ 2-sentence lede, primary CTA + underlined text link, proof line with `\|` rules, product evidence |
| Product evidence | `landing/HeroSection.tsx` (`ProductEvidence`) | 10px frame, title bar, résumé rail + question pane, waveform, listening row, visible caption below the frame |
| Capability index | `landing/FeatureGrid.tsx` | `<ol>` of 6, mono `01–06` in signal, 16px/600 titles, 13.5px descriptions, two columns, hairline row rules, **no icons** |
| Metric band | `landing/ProofBand.tsx` | 3 metrics, mono 30px in `--evidence`, 11px label, 10.5px note, surface background |
| Pricing | `landing/PricingSection.tsx` | 3 plans in one ruled grid; only the recommended plan gets a filled CTA; others are underlined text links with an arrow; billing toggle |
| FAQ | `landing/FaqSection.tsx` | native `<details>` rows, `+`/`−` affordance, focus ring on summary, answers ≤ 68ch |
| Final CTA | `src/app/page.tsx` | serif headline + one filled action + reassurance line; full-width button on mobile |
| Footer | `src/app/page.tsx` | one line + two links; no second hero |

Buttons come from `src/components/ui/button.tsx` (`default`, `outline`, `ghost`), but the
landing page overrides height/padding/type: `h-10 px-4 text-[13px] font-bold`.

## 7. Icons

- **Zero decorative icons.** No `Sparkles`, no icon tiles, no feature emoji.
- Functional icons allowed: `FileText` (file chip), `Check` (plan features), `ArrowUpRight`
  (text link), theme toggle. Size 12–14px, stroke 2, inherits text color.
- Any new icon must have a label or an accessible name, and must encode an action, not a mood.

## 8. States

Every interactive element defines: default, hover, focus-visible, active, disabled.
Every data surface defines: loading, empty, error.

- Hover: text links underline; buttons darken (`#A82B1C` light / `#FF826D` dark).
- Focus: 2px `--ring` with offset; never removed.
- FAQ: `open` changes `+` to `−` and reveals the answer; no animation required.
- Loading skeletons must mirror the final geometry (evidence frame, plan grid).

## 9. Accessibility

- One `h1` per page; sections are `<section>` with headings; `<footer>`/`<header>` landmarks.
- Body and UI text ≥ 4.5:1; `--muted-foreground` meets this on paper and card.
- Do not rely on color alone: progress has text, "Live" has a label, status has a label.
- Touch targets ≥ 40px; nav links have 44px row height on mobile menus.
- `prefers-reduced-motion` disables non-essential transitions.
- Decorative rules, dots and waveform are `aria-hidden`.

## 10. Responsive

| Breakpoint | Behaviour |
|---|---|
| `< 640px` | hero stacks (copy before media), CTAs stack at full width when needed, preview rail stacks above the question, plans become one column, final CTA button full width |
| `640–1023px` | hero stays stacked (the `lg` 12-column split starts at 1024px); capability index and plans are already two/three columns at `md` (768px) |
| `≥ 1024px` | 12-column asymmetric hero; header shows status label; nav links visible |

No horizontal overflow at 390px or 1280px. Headline ≤ 4 lines on mobile.

## 11. Copy

- Concrete nouns: interview, question, résumé, score, session.
- Hero description under 155 characters; body paragraphs under 72 words.
- CTAs start with a verb and match their destination (`Start a mock interview`, `Go Pro`).
- Never claim a metric the product does not produce. The metric band uses structural
  facts only (**5–7 questions** per plan, 30 min default, 0 recruiters with access).
- Forbidden: *revolutionize, supercharge, next-generation, seamless, unlock the power of AI,
  build faster ship smarter, learn more*.

### Canonical toast copy

One table for every toast the product may show. `id` is stable per event so a loading,
success and error state replace each other instead of stacking. Success fires only after
the commit; error copy is *what happened + what happens next*, never `error.message`, an
HTTP status or a provider name. Sentence case, no exclamation marks, max 3 visible.

| Event | id | Kind | Copy | Fires after |
|---|---|---|---|---|
| Upload started | `resume-upload` | loading | Uploading résumé… | file passes client type/size check and the upload begins |
| Upload accepted | `resume-upload` | success | Résumé uploaded. Preparing questions… | storage id returned and `resumes` row written |
| Upload failed | `resume-upload` | error | Upload failed. Check your connection and try again. | terminal failure only, not an intermediate retry |
| Interview created | `interview-create` | success | Interview ready. Open the lobby. | plan persisted and status is `setup` |
| Create failed | `interview-create` | error | We couldn't create the interview. Try again. | the create mutation rejects |
| Interview ended | `interview-end` | success | Interview ended. Building your report. | `completed` status committed |
| End failed | `interview-end` | error | We couldn't end the interview. Try again. | the status mutation rejects |
| Time limit reached | `interview-timer` | info | Time's up. Ending the interview and building your report. | the session timer reaches zero |
| Interviewer unavailable | `agent-dispatch` | error | The interviewer couldn't join. Rejoin to retry. | dispatch retries are exhausted |
| Lobby start failed | `lobby-start` | error | We couldn't start the interview. Rejoin from the dashboard. | token or join fails |

No toast for progress that already has an inline indicator (lobby checklist, report
polling) and no toast for a report that is queued and polled. Current copy that violates
this table is tracked as G-18 and G-13.

## 12. Migration map (product surface)

The landing page is the reference implementation. To migrate a product surface:

1. Decide the token model first: either promote the editorial palette to `:root`/`.dark`
   and delete `.landing-editorial`, or create a `.app-editorial` scope. Do not mix.
2. Replace `features/components/common/*` usage with `components/ui/*` on that page —
   do not port both libraries forward.
3. Replace hardcoded `slate-*`, `white`, `emerald-*`, `amber-*` with semantic tokens.
4. Apply the type table (§4); delete arbitrary `text-[Npx]` values not in it.
5. Remove decorative icons and gradient/glass effects.
6. Add loading/empty/error states if missing.
7. Verify dark mode, 390px, and keyboard focus before reporting.

Suggested order: auth → app shell (sidebar/header) → dashboard → interview setup →
lobby/room → report/review.

## 13. Conformance checklist

Run these before calling a design task complete:

```bash
cd client && bunx tsc --noEmit && bun run lint
# no hardcoded palette classes inside the landing surface
rg -n "slate-|zinc-|emerald-|amber-|bg-white|bg-black" src/features/components/landing src/app/page.tsx
# no decorative sparkles
rg -n "Sparkles" src/features/components/landing src/app/page.tsx
# no gradients or blur inside the landing surface
rg -n "gradient|backdrop-blur" src/features/components/landing src/app/page.tsx
# no off-table type sizes
rg -n "text-\[" src/features/components/landing src/app/page.tsx
```

Expected: zero matches for the palette, sparkle and gradient probes; `text-[` matches only
sizes listed in §4; `tsc` exit 0, lint 0 errors.

Manual probes: light + dark screenshots, 1280px and 390px, `scrollWidth === innerWidth`,
theme toggle repaints, billing toggle changes prices, and every toast matches the §11 table.
There is no FAQ surface yet (`FaqSection.tsx` does not exist), so there is no FAQ probe.

## 14. Do / Don't

Do

- Keep one primary action per section.
- Show the product, not an abstraction of it.
- Use rules, numbers and captions to structure a long page.
- Alternate density between sections.

Don't

- Don't put every section inside a rounded card.
- Don't repeat the same centered layout down the page.
- Don't add purple gradients or sparkle icons because the product is AI.
- Don't place two equal primary CTAs side by side.
- Don't shrink a screenshot until it becomes texture.
