# Agent Instructions: Frontend Feature Architecture

## Tech Stack & Styling Guidelines
- **Framework**: React / Next.js (Client-side components)
- **Styling**: Tailwind CSS with native Dark Mode support (`dark:` prefix classes)
- **Icons**: `lucide-react`
- **Path Alias**: `@/features/components/...`

## Core Requirements
1. **Reusable Components**: Modularize atomic elements (Buttons, Cards, Badges, Modals) into shared folders.
2. **Dark Mode**: Fully implemented using Tailwind's dark utility classes with seamless transitions.
3. **Production Ready**: TypeScript interfaces for all props, accessible markup (ARIA attributes), and clean state management.