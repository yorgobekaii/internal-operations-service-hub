# Week 5 — Release Operations

This document defines the repeatable release verification and handoff path for
the Internal Operations Service Hub. The application remains a teaching/demo
system: `x-user-id` resolves a known actor and is not production SSO, JWT, or
password authentication.

## 1. Release Candidate Identity & Configuration

A release candidate is identified by:

- The exact Git commit SHA under review.
- The committed `package-lock.json`, including the Node/npm dependency tree.
- A successful `npm install` from that lockfile.
- Backend `PORT` and frontend `NEXT_PUBLIC_API_URL` values supplied by the
  target environment.
- Backend `DATABASE_URL` and AI provider settings appropriate to the target.

Local development defaults are:

| Setting | Local default | Local boundary |
| :--- | :--- | :--- |
| `PORT` | `3000` | NestJS API only |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3000` | Next.js API origin |
| `DATABASE_URL` | `file:./dev.db` | Local SQLite only |
| `AI_PROVIDER` | `mock` | Deterministic advisory triage |

The release gate overrides the database to the ignored
`apps/backend/prisma/playwright.db`, binds the backend to port `3000`, binds
the frontend to port `3001`, and forces `AI_PROVIDER=mock`. Staged targets must
provide their own environment values, managed database, and provider policy;
the local/demo values are not staging or production credentials.

## 2. Release Gate Verification Path

Run from the repository root:

```bash
npm run verify:release
```

The command executes this order and stops on the first failure:

1. Build `@internal/shared`.
2. Validate the Prisma schema.
3. Build the backend and shared contract.
4. Lint the frontend.
5. Build the frontend.
6. Run backend unit tests.
7. Run isolated backend integration/E2E tests.
8. Run the 8-case advisory AI evaluation suite.
9. Copy the clean isolated Jest schema database into the separate browser
   database target.
10. Start the production backend and verify `GET /health`.
11. Start the production frontend.
12. Run the Playwright smoke journeys for requester, handler, and approver roles.

Required passing evidence is:

- Green shared/backend/frontend build and lint output.
- Green unit and real SQLite integration suites.
- 8/8 AI eval cases, with no provider key or external network dependency.
- Green Playwright browser checks covering intake, advisory AI, fulfillment,
  resolution, and approval.
- HTTP 200 from `/health` with a valid ISO timestamp and `status: "ok"`.

## 3. Observability & Health Signals

`GET /health` is intentionally unauthenticated so a process monitor can call it
without a teaching identity header.

Response contract:

```json
{
  "status": "ok",
  "timestamp": "2026-09-30T00:00:00.000Z"
}
```

The timestamp is generated per request in UTC ISO-8601 format. A non-2xx
response, invalid JSON, missing status, or invalid timestamp is a failed health
signal.

Operational logs should be structured around request IDs, route names, actor
IDs where appropriate, status codes, latency, provider state, and concise
failure reasons. Logs must not expose raw request payloads, prompt text, PII,
provider secrets, database URLs, or model credentials. AI triage is advisory:
logs may record provider selection and failure class, but never the submitted
prompt or model response payload.

## 4. Live Incident & Recovery Drill

### Simulated failure

Run the backend with `AI_PROVIDER=groq` and an unavailable provider or invalid
key. `POST /service-requests/ai-triage` should return HTTP `502`; no request
row, workflow transition, or direct AI database write is allowed.

### Detection and diagnosis

1. Confirm `/health` remains HTTP 200. This distinguishes an AI dependency
   outage from a process outage.
2. Check structured backend logs for the route, request ID, provider failure
   class, and HTTP status. Do not print the prompt, raw response, or secret.
3. Confirm the frontend presents a degraded/manual-intake message.
4. Confirm normal request creation and lifecycle endpoints remain authoritative.

### Recovery

1. Restore the provider configuration or replace the unavailable provider
   credential through the environment secret mechanism.
2. Restart the backend so configuration is reloaded.
3. Re-run `/health` and a redacted AI triage smoke request.
4. Run `npm run eval:triage` and then `npm run verify:release` with the
   deterministic mock provider before declaring the candidate recovered.

## 5. The “Three-Stranger” Handoff

### Stranger User

1. Run the setup commands in `README.md`.
2. Start the backend and frontend.
3. Open `http://localhost:3001`.
4. Select a demo actor from the role picker.
5. Use the AI assistant for an advisory draft or open **New Request**.
6. Submit a category-complete request and confirm it appears with `Submitted`.
7. Switch to the matching handler actor, start work, and resolve it.
8. For a Finance request of at least `$1000`, switch to the designated Finance
   approver and approve it from **Approvals**.

### Stranger Engineer

1. Clone the repository and run `npm install`.
2. Copy the backend and frontend environment examples if overrides are needed.
3. Run `npm run setup` for the local SQLite schema.
4. Install the browser runtime once with `npx playwright install chromium`.
5. Run `npm run verify:release` from the repository root.
6. Treat any failed gate as a release blocker and preserve the command output
   with the candidate commit SHA.

### Operator

1. Monitor `GET /health` without an identity header.
2. Alert on non-2xx responses, invalid response shape, or stale/unparseable
   timestamps.
3. For AI-only failures, keep intake available and direct users to manual
   entry while diagnosing provider logs.
4. Restart the backend after a corrected environment/provider configuration.
5. Confirm `/health`, AI triage behavior, and `npm run verify:release` before
   returning the service to normal release status.
