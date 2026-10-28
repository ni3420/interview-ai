# ADR 0001 — Adopt the editorial design system for the marketing surface

- **Status:** Accepted (implementation not yet applied)
- **Date:** 2026-10-28
- **Deciders:** project owner
- **Supersedes:** the "Precision" violet direction recorded in the previous `docs/design-system.md`
- **Related:** `docs/design-system.md`, `docs/architecture.md` (G-08), `AGENTS.md` (§8 design invariants, §9 gates)

## Context

The client shipped with two incompatible visual languages:

1. **Product surface** (dashboard, interview, auth, report) — neutral greys with a violet `--primary` defined in `client/src/app/globals.css`.
2. **Marketing landing** (`client/src/app/page.tsx` + `client/src/features/components/landing/*`) — the same violet tokens plus decorative iconography (`Sparkles`), floating cards, and a radial gradient.

An editorial design template was supplied by the project owner: warm paper background, ink black, signal red, evidence blue, Georgia serif display type, 1180px container, numbered sections, 12-column asymmetric hero, no sparkles, no gradients, no glass, one primary CTA per section.

The earlier "Precision" direction (violet, technical, instrument-panel) was reviewed and rejected in favour of the editorial template. The question this ADR answers is *how far* the editorial system reaches on the first pass, because changing global tokens would restyle every product surface at once and there is no visual regression suite to catch breakage.

## Decision

1. **The editorial system is the target visual language for the project.** `docs/design-system.md` is the single specification; `AGENTS.md` §8 (D1–D16) is the enforceable subset.
2. **The first implementation surface is marketing only.** Tokens are applied through a `.landing-editorial` scope (plus `.dark .landing-editorial`) in `client/src/app/globals.css`, not by overwriting the global `:root` values. Marketing markup consumes `bg-background`, `text-foreground`, `bg-primary`, etc. inside that scope, so no component needs to hardcode hex values (D6).
3. **Product surfaces keep the current tokens until they are migrated deliberately**, in the order given by `docs/design-system.md` §12: auth → app shell → dashboard → interview setup → lobby/room → report. Each step is followed by dark-mode and 390px parity checks before the next one starts.
4. **Decorative icons are removed from marketing.** No `Sparkles` or equivalent ornament; icons exist only where they carry information (D2).
5. **Promoting the palette to `:root`** — that is, making editorial the only language — requires a follow-up ADR (0002) after the product surfaces are migrated and verified. It must record the WCAG check for every foreground/background pair that changes.
6. **Contrast is adjusted, not copied.** The template's `#F04D35` on paper measures ≈2.9:1, below AA for small text. The landing `--primary` is `#C93625` (≈5.2:1 on `#FFFDF7`). `--signal` keeps the brighter red for non-text accents only.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Apply the editorial palette to `:root` immediately (global rebrand) | Restyles every product screen with no visual regression coverage; a single pass cannot verify dark mode, focus rings, chart colours, or disabled states across six surfaces. |
| Keep "Precision" (violet) and only remove the sparkles | The owner explicitly rejected the violet direction; keeping it leaves the brief unmet. |
| Maintain two token sets permanently (`editorial` + `precision`) | Two design systems with no owner drift apart. One system per surface, one system at the end of the migration (D1, D13). |
| Restyle the landing with hardcoded hex values instead of a token scope | Blocks dark mode (D9) and makes the later migration mechanical but error-prone (D6). |
| Ship the token scope and the product migration together | Too large a change to review; the owner asked for the landing first and a decision before touching the rest. |

## Consequences

**Positive**

- The landing can be judged and iterated in isolation without risking the product UI.
- Dark mode is defined up front for both scopes, so the eventual promotion is a value move, not a redesign.
- Removing decorative icons and gradients eliminates the two most obvious "AI template" tells on the marketing page.
- The migration order in §12 gives a reviewable sequence instead of one unreviewable diff.

**Negative / accepted risks**

- **Two visual languages coexist** until the migration completes. A user clicking from marketing into the dashboard crosses a visible seam. Accepted for the duration of the migration; each step narrows the gap.
- **Duplicate token definitions** in `globals.css` (global and `.landing-editorial`). Accepted; it is the price of isolation. The duplicate disappears when ADR 0002 promotes the palette.
- **The landing implementation is not on disk right now.** It was authored and reverted during the design review (working tree returned to `71a180f`). `docs/design-system.md` and `AGENTS.md` describe the target, not shipped code — this ADR is the record that the code still has to be re-applied and re-verified.
- **No automated visual regression tests** exist. Verification is manual screenshots at 1280px and 390px in both themes plus the conformance greps in `docs/design-system.md` §13. If the migration grows, add a screenshot diff before step 4.

## Compliance checks

Before the landing implementation is accepted as conforming:

```bash
cd client
bunx tsc --noEmit                    # type check
bun run lint                         # eslint, 0 errors (warnings are baseline)
```

```bash
# from repo root — the conformance greps in docs/design-system.md §13
rg -n "Sparkles" client/src/app/page.tsx client/src/features/components/landing
rg -n "gradient|backdrop-blur" client/src/app/page.tsx client/src/features/components/landing
rg -n "slate-|zinc-|emerald-|amber-|bg-white|bg-black" client/src/app/page.tsx client/src/features/components/landing
```

All three greps must return zero matches, and screenshots must be captured at 1280×… and 390×… in light and dark before the surface is marked conforming in `docs/design-system.md` §2.
