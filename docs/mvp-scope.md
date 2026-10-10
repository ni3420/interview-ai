# Interview AI — MVP Scope

## Product Goal

A student uploads a resume and job description, completes a personalized
AI mock interview with adaptive follow-up questions, and receives a
useful final evaluation report.

## MVP Features

### 1. Authentication
- Sign up and sign in using Clerk with oauth .
- Protected application pages.

### 2. Dashboard
- Start a new interview.
- View previous interviews and their statuses.
- Open completed reports.

### 3. Interview Setup
- Upload a supported resume file.
- Enter a job description.
- Validate inputs and show processing status.

### 4. AI Interview
- Generate an interview plan from the resume and job description.
- Ask a question and accept the student's answer.
- Generate contextual follow-up questions.
- Save interview progress and handle recoverable failures.

### 5. Evaluation and Report
- Evaluate answers against a defined rubric.
- Generate an overall assessment, strengths, weaknesses,
  and improvement recommendations.
- Save and display the final report.

### 6. Quality and Reliability
- Responsive UI and light/dark themes.
- Useful loading, empty, error, and toast states.
- Authentication and data-ownership checks.
- Unit, integration, and end-to-end tests for critical flows.
- Basic error monitoring.

## Explicitly Out of Scope Until Approved

- Live voice or video interviews.
- Automatic speech transcription.
- Additional AI writing/review products.
- Advanced vector retrieval or RAG.
- Multiple AI agents and complex orchestration frameworks.
- Advanced analytics and administrative dashboards.
- Unrequested subscription tiers or complex billing rules.
- Premature microservices, custom caching systems, or extra databases.

Stripe, GetStream, Inngest, Redis, and Qdrant should be implemented
when the approved MVP requires their capabilities. Their presence in the
architecture does not automatically authorize full integration.

## MVP Completion Criteria

- A user can sign in.
- A user can submit a resume and job description.
- The system generates relevant interview questions.
- Follow-up questions use previous answers as context.
- Interview answers and progress are persisted reliably.
- A completed interview produces a saved report.
- The user can revisit previous interviews and reports.
- Critical failure cases are tested.
- No known critical security or data-integrity issue remains.

The user must verify the completed MVP before additional product features
are started.