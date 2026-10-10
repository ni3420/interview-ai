# Interview AI — UI Design System

## 1. Design Direction

Build a modern, polished, minimal SaaS interface for an AI interview
preparation platform.

The interface should feel professional, calm, focused, and trustworthy.

Priorities:
- Clear visual hierarchy.
- Consistent spacing and typography.
- Minimal visual clutter.
- Accessible contrast and interactions.
- Responsive layouts.
- Reusable components.
- Fast loading and minimal client-side JavaScript.

Do not introduce a new visual style for individual pages.

## 2. Color System

Use semantic CSS variables rather than hardcoded colors inside components.

Required tokens:
- background
- foreground
- card
- card-foreground
- primary
- primary-foreground
- secondary
- secondary-foreground
- muted
- muted-foreground
- accent
- accent-foreground
- border
- input
- ring
- destructive

Initial direction:
- Primary accent: violet.
- Light background: soft neutral white.
- Dark background: deep neutral charcoal.
- Surfaces: subtle contrast against the background.
- Borders: low-contrast neutral.
- Success, warning, and error colors: semantic and accessible.

Exact values must be defined centrally in the global theme stylesheet.
Do not scatter hex codes across components.

Do not use gradients, glowing effects, or excessive shadows by default.

## 3. Typography

Use a consistent, readable sans-serif font.

Recommended hierarchy:
- Page title: 28–32px on desktop.
- Section heading: 20–24px.
- Card heading: 16–18px.
- Body text: 14–16px.
- Supporting text: 12–14px.

Use appropriate font weights and line heights.
Avoid unnecessarily large headings and oversized text.
Long-form feedback and reports must remain comfortable to read.

Use a consistent typography scale instead of arbitrary sizes.

## 4. Spacing System

Use a consistent 4px-based spacing scale.

Allowed base spacing values:
4, 8, 12, 16, 20, 24, 32, 40, 48, 64px.

Guidelines:
- Related elements: 8–12px apart.
- Form fields: 16–20px apart.
- Card padding: usually 20–24px.
- Section spacing: usually 24–32px.
- Major page sections: 32–48px apart.

Use responsive spacing where appropriate.
Avoid arbitrary margins and repeated one-off spacing values.

## 5. Layout and Sizing

- Use a consistent application shell.
- Keep dashboard content within a readable maximum width.
- Use a shared sidebar and header for authenticated dashboard pages.
- Use a dedicated, distraction-free layout for active interviews.
- Use consistent card radii, borders, and padding.
- Avoid unnecessary nested cards.
- Align page titles, actions, and content consistently.
- Forms should have clear labels and logical grouping.

## 6. Responsive Design

Design mobile-first and verify:
- Mobile: approximately 320–767px.
- Tablet: approximately 768–1023px.
- Desktop: 1024px and above.

Requirements:
- No unintended horizontal scrolling.
- Navigation adapts to small screens.
- Cards stack on narrow screens.
- Buttons and inputs remain touch-friendly.
- Dialogs and dropdowns fit within the viewport.
- Interview controls remain accessible on mobile.
- Tables use an appropriate responsive alternative when necessary.

Do not merely shrink the desktop layout.

## 7. Theme Support

Support:
- Light mode.
- Dark mode.
- System preference.

All shared components must use semantic theme tokens.
No component should assume a fixed white background or black text.

Avoid flash of the wrong theme during initial page load.
Maintain readable contrast in every theme.

Accent-color customization is optional and must not be implemented
unless it is included in the approved scope.

## 8. Component Rules

Use shadcn/ui as the base for common primitives.

Standardize:
- Buttons.
- Inputs and textareas.
- Selects and checkboxes.
- Cards.
- Dialogs and drawers.
- Dropdown menus.
- Tooltips.
- Tabs.
- Badges.
- Skeletons.
- Alerts.
- Toast notifications.

Create shared application components only when there is a clear reuse case.

Do not rebuild existing shadcn/ui components without a concrete reason.
Avoid giant components and unnecessary component abstraction.

## 9. UI States

Every data-driven screen must handle applicable states:
- Loading.
- Empty.
- Success.
- Error.
- Disabled.
- Pending or processing.

Use skeletons for meaningful loading layouts.
Use empty states that explain the next useful action.
Use inline validation for form errors.
Use toasts for appropriate transient feedback.

Never show a success toast before the operation succeeds.
Avoid duplicate notifications for the same error.

## 10. Toast Notifications

Use Sonner through the application's shared notification setup.

- Success: meaningful completed actions.
- Error: actionable failures.
- Loading: only when ongoing feedback is useful.
- Validation: prefer field-level feedback.
- Avoid exposing internal errors or sensitive information.

Mount the Toaster once in the appropriate application layout.

## 11. Icons and Visual Effects

Use Lucide icons consistently.
Keep icon sizes and stroke styles consistent.
Use icons with labels where their meaning is not obvious.

Avoid:
- Emoji as primary interface icons.
- Unnecessary animation.
- Excessive blur and glassmorphism.
- Multiple competing accent colors.
- Decorative effects that reduce readability.

Respect reduced-motion preferences.

## 12. Accessibility

- Use semantic HTML.
- Provide labels for form controls.
- Support keyboard navigation.
- Keep focus indicators visible.
- Use accessible dialog and menu behavior.
- Maintain sufficient text and control contrast.
- Do not communicate status through color alone.
- Provide accessible names for icon-only buttons.

## 13. Performance

- Prefer Server Components where appropriate.
- Use Client Components only for interactive behavior.
- Lazy-load heavy video, chart, and editor modules.
- Avoid unnecessary dependencies and global state.
- Avoid unnecessary re-renders and premature memoization.
- Do not sacrifice accessibility for visual effects.

## 14. UI Consistency Checklist

Before completing any UI task, verify:
- Correct theme tokens are used.
- Typography and spacing follow the system.
- Existing components are reused.
- Light and dark modes work.
- Mobile, tablet, and desktop layouts work.
- Loading, empty, and error states are covered.
- Toasts are used appropriately.
- No unrelated components or pages were added.
- The result matches the existing application style.

If a design requirement conflicts with this system, explain the conflict
and ask for approval before introducing a new visual pattern.