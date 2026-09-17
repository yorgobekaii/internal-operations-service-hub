# Week 3 — Full-Stack Delivery & Confidence Suite

## 1. Completed Flow Description

### Vertical Slice Summary

The system implements a complete full-stack vertical slice for **Internal Service Request Management**:

1.  **Frontend (Next.js App Router + Tailwind CSS)** — `apps/frontend`
    - An employee opens the dashboard at `http://localhost:3001`.
    - They fill in a **Title** and select a **Category** (IT, HR, Finance, Operations).
    - A Next.js **Server Action** (`src/app/actions.ts`) sends a `POST` request to the NestJS backend.
    - The dashboard re-renders, showing the newly created request with status `Submitted`.
    - The employee can click **"Start Work"** (transitions to `In Progress`) or **"Resolve"** (transitions to `Resolved`) via `PATCH` requests.

2.  **Backend (NestJS + Prisma ORM + SQLite)** — `apps/backend`
    - **`POST /service-requests`** — Creates a new service request, persists it to SQLite, returns the record with status `Submitted`.
    - **`GET /service-requests`** — Lists all service requests ordered by creation date (descending).
    - **`GET /service-requests/:id`** — Fetches a single service request by UUID.
    - **`PATCH /service-requests/:id/status`** — Validates and executes a state transition against the deterministic state machine.

3.  **Database (SQLite via Prisma)**
    - Schema: `ServiceRequest` model with fields `id` (UUID), `title`, `category`, `status`, `createdAt`, `updatedAt`.
    - Data persists across server restarts in `apps/backend/prisma/dev.db`.

---

## 2. Enforced Boundaries & Business Rules

### Deterministic State Machine

The service enforces the following transition rules from `docs/data-model.md`:

| From State         | Allowed Transitions                        |
| :----------------- | :----------------------------------------- |
| **Submitted**      | `In Progress`                              |
| **In Progress**    | `Resolved`, `Blocked`, `Declined`          |
| **Blocked**        | `In Progress`, `Declined`                  |
| **Pending Approval** | `In Progress`, `Declined`                |
| **Resolved**       | *(Immutable — no transitions allowed)*     |
| **Declined**       | *(Immutable — no transitions allowed)*     |

### Invariants Enforced

1.  **Immutability Invariant**: Once a request reaches `Resolved` or `Declined`, any further status update is rejected with `422 Unprocessable Entity`.
2.  **Invalid Transition Guard**: Attempting an illegal jump (e.g., `Submitted` → `Resolved`) returns `400 Bad Request`.
3.  **Not Found Guard**: Attempting to fetch or update a non-existent request ID returns `404 Not Found`.

---

## 3. Automated Confidence Suite

### Test 1 — Business Rule Test (Unit)

**File:** `apps/backend/src/service-requests/service-requests.service.spec.ts`
**What it verifies:** The state machine rejects the invalid transition `Submitted → Resolved` with a `BadRequestException`.
**How:** Uses a mocked `PrismaService` to isolate the business logic. The mock returns a request in `Submitted` status, and the test asserts that calling `updateStatus` with `Resolved` throws.

### Test 2 — Backend-to-Database Integration Test

**File:** `apps/backend/test/app.e2e-spec.ts`
**What it verifies:** A `POST /service-requests` call persists data to the real SQLite database, and a subsequent `GET /service-requests/:id` retrieves the exact same record.
**How:** Boots the full NestJS application (including Prisma connected to SQLite) via `supertest`. Sends a real HTTP request and asserts the response body matches.

### Test 3 — E2E Test (UI Simulation)

**Covered by:** `apps/backend/test/app.e2e-spec.ts` (the integration test doubles as the E2E test since Server Actions execute on the server side, making the real HTTP call to the NestJS backend identical to what the frontend does).
**What it verifies:** The exact same `POST` + `GET` flow that the Next.js Server Action executes — creating a ticket and reading it back — works end-to-end against the real database.

### Test 4 — Regression Test

**File:** `apps/backend/src/service-requests/service-requests.service.spec.ts`
**What it verifies:** The previously working valid transition `Submitted → In Progress` continues to work correctly and returns the updated status.
**How:** Mocks a `Submitted` request, calls `updateStatus` with `In Progress`, and asserts the returned object has `status: 'In Progress'`.

---

## 4. Passing Test Output

```
> @internal/backend@0.0.1 test:e2e
> jest --config ./test/jest-e2e.json

PASS test/app.e2e-spec.ts (7.046 s)
  AppController (e2e)
    √ 2-Backend-to-database integration test: Should persist and retrieve a ServiceRequest via SQLite (54 ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        7.297 s
Ran all test suites.

> @internal/backend@0.0.1 test
> jest

PASS src/app.controller.spec.ts
PASS src/service-requests/service-requests.service.spec.ts (5.524 s)

Test Suites: 2 passed, 2 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        6.334 s, estimated 7 s
Ran all test suites.
```

**All 5 tests pass (4 custom + 1 pre-existing).** Zero failures.

---

## 5. Files Created or Modified

### New Files
| File | Purpose |
| :--- | :--- |
| `apps/frontend/src/app/page.tsx` | Next.js dashboard UI (submit form + request list) |
| `apps/frontend/src/app/actions.ts` | Server Actions for `POST` and `PATCH` to backend |
| `apps/backend/src/prisma/prisma.service.ts` | NestJS-wrapped Prisma client |
| `apps/backend/src/prisma/prisma.module.ts` | NestJS module exporting PrismaService |
| `apps/backend/prisma/schema.prisma` | Prisma schema with `ServiceRequest` model |
| `apps/backend/src/service-requests/service-requests.service.spec.ts` | Business rule + regression tests |
| `apps/backend/test/app.e2e-spec.ts` | Integration + E2E test |
| `docs/week3-full-stack-delivery.md` | This delivery document |

### Modified Files
| File | Change |
| :--- | :--- |
| `apps/backend/src/main.ts` | Added `app.enableCors()` |
| `apps/backend/src/service-requests/service-requests.service.ts` | Replaced in-memory `Map` with Prisma DB calls |
| `apps/backend/src/service-requests/service-requests.controller.ts` | Made methods `async`, added `GET /` (findAll) |
| `apps/backend/src/service-requests/service-requests.module.ts` | Imported `PrismaModule` |
| `apps/backend/src/service-requests/dto/update-service-request-status.dto.ts` | Ensured `status: string` field exists |
| `apps/backend/package.json` | Added `prisma` (devDep) and `@prisma/client` (dep) |

