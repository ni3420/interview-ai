# Frontend Instructions — Interview AI

## 1. Frontend Goal

Build a polished, accessible, responsive MVP using Next.js and TypeScript.

Prioritize functional user journeys over decorative UI or premature
design-system expansion.

## 2. Approved Technology

- Next.js with the existing App Router setup.
- TypeScript with strict checking where supported.
- Tailwind CSS.
- shadcn/ui for required UI primitives.
- Lucide icons.
- Clerk for authentication.
- Convex React integration for application data and reactive updates.
- Zod for frontend form and request validation.
- React Hook Form when form complexity justifies it.
- Sonner for toast notifications.
- Sentry for error monitoring.

Do not add Zustand, another component library, or another form library
without demonstrating a need and obtaining approval.

## 3. Feature-Based Structure

Organize application code by feature:

src/
  app/
  components/
    ui/
    layout/
    shared/
  features/
    dashboard/
    resume/
    interview/
    reports/
    settings/
    billing/
  hooks/
  lib/
    api/
    auth/
    theme/
    utils/

convex/
  schema.ts
  users.ts
  interviews.ts
  answers.ts
  reports.ts

This is a suggested starting structure, not a requirement to create every
folder or file immediately. Add modules only when their functionality is
approved and needed.

Keep feature-specific components and hooks near their feature.
Keep reusable primitives in components/ui and application-wide components
in components/shared.

## 4. Convex Rules

- Use Convex queries for reads and mutations for writes.
- Use reactive Convex subscriptions when live updates provide real value.
- Define and maintain schemas and indexes intentionally.
- Verify identity and record ownership inside server-side functions.
- Never rely on hidden UI controls as authorization.
- Keep AI orchestration out of frontend components and Convex UI code.
- Persist important interview progress at explicit checkpoints.
- Handle pending, loading, empty, error, and retry states.
- Avoid duplicating the same source of truth in React state and Convex.
- Never treat browser state as the authoritative payment or score record.

The AI service must not be called directly from browser code if doing so
would expose secrets or bypass required authorization.

## 5. UI Component Rules

- Prefer small, focused components with clear props.
- Keep complex interview UI split into logical parts, such as:
  QuestionPanel, AnswerComposer, InterviewProgress, and InterviewControls.
- Do not split every trivial element into a separate component.
- Reuse shadcn/ui primitives before creating replacements.
- Avoid components with unrelated responsibilities or huge prop lists.
- Keep business logic outside presentation-only components where practical.
- Use accessible labels, keyboard interactions, and visible focus states.

## 6. Theme and Responsive Design

- Support light, dark, and system theme modes.
- Use semantic CSS variables and design tokens.
- Avoid hardcoded colors throughout individual components.
- Add accent-color customization only when included in the approved scope.
- Persist user appearance preferences using the chosen theme solution.
- Prevent theme flashes where practical.
- Test mobile, tablet, and desktop layouts.
- Respect reduced-motion preferences.
- Do not add elaborate animation libraries without approval.

## 7. Toast Notifications

Use Sonner through one shared toast utility or wrapper.

- Success: confirm meaningful completed actions.
- Error: explain the failure and provide a useful recovery action where possible.
- Loading: use only for operations where persistent progress feedback helps.
- Validation errors: show near the relevant form field when appropriate.
- Avoid duplicate toasts for the same failure.
- Do not show success before a server operation has actually succeeded.
- Do not expose stack traces or sensitive server errors.
- Do not use toast messages as a replacement for form validation or
  persistent page-level error states.

Add the shared Toaster once in the appropriate application layout.
Use the installed shadcn/ui and Sonner conventions rather than maintaining
multiple notification systems.

## 8. Data Fetching and Performance

- Prefer Server Components for non-interactive UI when appropriate.
- Use Client Components only where browser interaction or client state
  is required.
- Use Convex hooks for Convex-managed data.
- Use the shared API client for Hono or AI-service operations.
- Avoid unnecessary useEffect-based fetching.
- Lazy-load heavy video, chart, and editor features when appropriate.
- Do not introduce global state unless multiple distant components need it.
- Avoid premature memoization and speculative caching.
- Keep secrets and privileged SDKs server-only.

## 9. Forms and API Contracts

- Validate user input with Zod.
- Match the documented API request and response schemas.
- Use typed API helpers rather than scattered raw fetch calls.
- Handle network failures, timeouts, and server validation errors.
- Never trust a client-provided user ID, score, or subscription status.
- Do not silently rename backend fields.

## 10. Frontend Definition of Done

- Responsive UI works at relevant screen sizes.
- Loading, empty, success, and error states are covered.
- Toasts appear only for appropriate outcomes.
- Convex permissions and data ownership are respected.
- Relevant tests, lint, type checks, and build checks pass.
- No unrelated UI or dependencies were added.
- Report results and wait for user verification before the next feature.