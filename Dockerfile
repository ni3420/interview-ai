# syntax=docker/dockerfile:1
#
# Root image: the BullMQ resume-processing worker (worker/).
# Built from the repository root so the worker, its lockfile, and any future
# root-level tooling share a single build context.

FROM oven/bun:1.4.3 AS deps
WORKDIR /app
COPY worker/package.json worker/bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.4.3 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY worker/ ./
RUN bun run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    LOG_LEVEL=info

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

USER node

CMD ["node", "dist/index.js"]
