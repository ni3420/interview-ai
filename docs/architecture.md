# Interview AI — Architecture Agreement

## 1. System Boundaries

### Web Application
Next.js owns UI, navigation, forms, user interaction, and presentation.

### Application Data Layer
Convex owns durable application data, including interview records,
answers, status, evaluations, and final reports.

Hono handles approved application HTTP endpoints where needed.
Clerk provides identity; authorization is verified by trusted server code.

### AI Service
Python/FastAPI owns AI processing, model-provider integration,
adaptive question generation, answer evaluation, and report generation.

### External Services
- GetStream: approved video/chat capabilities.
- Stripe: billing and subscriptions.
- Inngest: approved background workflows.
- Sentry: error monitoring.
- Redis and Qdrant: only when required by an approved feature.

## 2. Request Flow

1. The user submits an action in Next.js.
2. The application verifies identity and permissions.
3. Required application state is created or saved in Convex.
4. An authorized request reaches the AI service through the approved
   server-side communication path.
5. The AI service validates input and returns a typed result.
6. The application validates the result and persists required data.
7. The frontend renders the confirmed state.

The exact persistence order must be specified per operation. Do not assume
that an AI result is saved merely because the model returned it.

## 3. Ownership Rules

- Clerk: authentication identity.
- Convex: application records and interview history.
- Python: AI execution and model-specific logic.
- Stripe: payment processing; verified subscription events update
  application entitlements.
- GetStream: video/chat transport.
- Redis: temporary or cache data only, unless explicitly approved otherwise.
- Qdrant: vector retrieval data only when needed.

## 4. API Contract Rules

- Use versioned endpoints, such as /v1/interviews/next-question.
- Use OpenAPI for the Python HTTP contract.
- Validate Python inputs/outputs with Pydantic.
- Validate TypeScript inputs with Zod where appropriate.
- Keep field names, optional fields, enums, IDs, and error formats consistent.
- Document streaming protocols separately if SSE or WebSocket is introduced.
- Add contract tests for important frontend/backend interactions.
- Breaking changes require an explicit decision and migration plan.

## 5. Error Contract

Define a consistent error response before implementing integrations.

Example:

{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid",
    "request_id": "example-request-id"
  }
}

The example is illustrative; implement and document the actual schema
before using it in production. Never return secrets or stack traces.

## 6. Change Management

When changing a contract or data model:
1. Identify every affected consumer.
2. Update the documented contract.
3. Add or update validation and regression tests.
4. Preserve compatibility where practical.
5. Explain migration or rollout requirements.
6. Wait for approval before making an unapproved breaking change.

## 7. Architecture Decision Records

Record significant approved decisions in docs/decisions/.

Each decision should state:
- Context and problem.
- Decision made.
- Alternatives considered.
- Trade-offs.
- Consequences and migration implications.

Do not create a decision record for every minor implementation detail.