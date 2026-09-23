# Week 3 — Full-Stack Delivery & Confidence Suite

## 1. Completed Flow Description

### Narrow Service Request flow (explicit API contract)

`Next.js frontend -> NestJS backend -> Prisma/SQLite`, typed by `@internal/shared`:

1. **Contract (`packages/shared/src/index.ts`)** — explicit, imported both sides, strict:
   - `ServiceRequestStatus`, `ServiceRequestCategory`, `CreateServiceRequestDto` (with `category: ServiceRequestCategory`), `UpdateServiceRequestStatusDto`, `ServiceRequest`
   - `USER_ROLE_HEADER='x-user-role'`, `OPERATOR_ROLES=['operator','admin']`, `ALLOWED_TRANSITIONS: Record<ServiceRequestStatus, ServiceRequestStatus[]>`, `SERVICE_REQUEST_ROUTES`, `SERVICE_REQUEST_CATEGORIES/STATUSES`
   - Backend imports it in `service-requests.service.ts` (incl. `toContract` Prisma→shared mapper), `dto/*.ts`, `auth.guard.ts`, `entities/service-request.entity.ts`
   - Frontend imports it in `src/app/actions.ts` (`SERVICE_REQUEST_ROUTES`, `USER_ROLE_HEADER`, `OPERATOR_ROLES`, `ServiceRequestStatus`) and `src/app/page.tsx` (`ServiceRequest`, `SERVICE_REQUEST_ROUTES`)
2. **Frontend (Next.js App Router)** — `apps/frontend` on `http://localhost:3001`:
   - Dashboard `page.tsx` (`export const dynamic = 'force-dynamic'`) fetches `GET /service-requests` via `NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'`, renders submit form + list with badges/controls for all six states (`Submitted`, `Pending Approval`, `In Progress`, `Blocked`, `Resolved`, `Declined`).
   - Server Action `createServiceRequest` sends `POST /service-requests {title, category}`.
   - Server Action `updateServiceRequestStatus(id, status)` sends `PATCH /service-requests/:id/status {status}` with `x-user-role: operator` (derived from shared `OPERATOR_ROLES`, not a hardcoded string).
   - `revalidatePath('/')` re-renders `Submitted`, `Start Work -> In Progress`, `Resolve -> Resolved` (plus `Approve`, `Resume` for gating/blocked states).
3. **Backend (NestJS)** — `apps/backend` on `http://localhost:3000`, `strict: true`:
   - `POST /service-requests` -> `create()` persists `status='Submitted'` (category enforced by `@IsIn(SERVICE_REQUEST_CATEGORIES)`), returns `201`.
   - `GET /service-requests` -> `findAll()` ordered `createdAt desc`.
   - `GET /service-requests/:id` -> `findOne()` or `404`.
   - `PATCH /service-requests/:id/status` -> `AuthGuard` then `updateStatus()` against `ALLOWED_TRANSITIONS`, returns `200` or `400/403/404/422`. Prisma rows are mapped to the shared contract before returning (no `any`, no Prisma-type leakage).
4. **Persistence (SQLite via Prisma)** — `apps/backend/prisma/schema.prisma` (`datasource url = env("DATABASE_URL")`):
   - `ServiceRequest { id uuid, title, category, status default Submitted, createdAt, updatedAt }`
   - Dev DB `apps/backend/prisma/dev.db` (`DATABASE_URL=file:./dev.db`, see `.env.example`), managed with `npx prisma generate` + `npx prisma db push` (via `npm run prisma:push --workspace=@internal/backend`).
   - Isolated e2e DB `apps/backend/prisma/test.db` (`DATABASE_URL=file:./test.db`, git-ignored, auto-migrated by `test/test-database.ts` + `test/setup-e2e.ts`). E2E runs leave `dev.db` byte-identical.

## 2. Enforced Boundaries & Business Rules

### State machine (`ALLOWED_TRANSITIONS` in shared, enforced in `ServiceRequestsService`)

| From State | Allowed Transitions |
| :--- | :--- |
| **Submitted** | `In Progress`, `Pending Approval`, `Declined` (reconciled with `product-spec.md` / `data-model.md`: approval gating, auto-start, validation-failure decline) |
| **In Progress** | `Resolved`, `Blocked`, `Declined` |
| **Blocked** | `In Progress`, `Declined` |
| **Pending Approval** | `In Progress`, `Declined` |
| **Resolved** | *(Immutable)* |
| **Declined** | *(Immutable)* |

### Boundary rules (all proven by e2e tests)

| Rule | Allowed case | Denied / rejected case | Code |
| :--- | :--- | :--- | :--- |
| **Authorization** (`auth.guard.ts` on `PATCH :id/status`, `x-user-role` must be `operator`/`admin`) | `PATCH` with `x-user-role: operator` -> `200` | `PATCH` without header -> `403 Forbidden`; `PATCH` with `x-user-role: viewer` -> `403` | `403` |
| **Invalid request** (`ValidationPipe` + DTO `@IsString/@IsNotEmpty/@IsIn`, + transition check) | valid `POST {title, category}` -> `201`; `Submitted -> Pending Approval` -> `200` | `POST {title:''}` -> `400`; `POST` missing `category` -> `400`; `POST {category:'Flying'}` -> `400`; `PATCH {status:'Flying'}` -> `400`; `Submitted -> Resolved` skip -> `400` | `400` |
| **Expected failure** (`findOne` throws `NotFoundException`) | `GET /:id` existing -> `200` | `GET /non-existent-id` -> `404`; `PATCH /non-existent-id/status` -> `404` | `404` |
| **Immutability** | `In Progress -> Resolved` -> `200`; `In Progress -> Declined` -> `200` | `Resolved -> In Progress` -> `422 Unprocessable Entity`; `Declined -> In Progress` -> `422` | `422` |

## 3. Automated Confidence Suite (all passing)

| Required type | File | Test name | What it proves |
| :--- | :--- | :--- | :--- |
| **1 Business-rule** | `src/service-requests/service-requests.service.spec.ts` | `1-Business-rule test: should reject invalid state transition from Submitted to Resolved` | Service rejects `Submitted -> Resolved` with `BadRequestException` (typed Prisma fixtures, zero `any`) |
| **1 Backend-to-DB integration** | `test/app.e2e-spec.ts` | `2-Backend-to-database integration test` | Real `POST` persists to isolated SQLite `test.db`, real `GET /:id` returns same record (`dev.db` untouched) |
| **1 Meaningful E2E** | `test/app.e2e-spec.ts` | `3-Meaningful E2E test: Full POST -> PATCH -> GET lifecycle` | Real `POST (Submitted) -> PATCH In Progress (operator) -> PATCH Resolved (admin) -> GET` verifies persisted `Resolved` |
| **1 Regression** | `src/service-requests/service-requests.service.spec.ts` | `4-Regression test: should allow valid transition from Submitted to In Progress` | Previously working `Submitted -> In Progress` still returns updated status |

Additional boundary e2e cases in same file: auth allowed (`operator -> 200`), auth denied (no header `-> 403`, `viewer -> 403`), bad payloads (`400 x4` incl. unknown category), illegal skip (`Submitted -> Resolved -> 400`), approval gating (`Submitted -> Pending Approval -> In Progress -> 200`), missing IDs (`404 x2`), immutable (`Resolved -> 422`, `Declined -> 422`).

## 4. Passing Test Execution Output (exact, via root `npm test`)

Root `npm test` (`test:backend` + `test:backend:e2e`) is green. Timings vary per machine; test names/counts are stable.

```
> internal-operations-service-hub@1.0.0 test
> npm run test:backend && npm run test:backend:e2e

> internal-operations-service-hub@1.0.0 test:backend
> npm run build --workspace=@internal/shared && npm run test --workspace=@internal/backend

> @internal/shared@0.0.1 build
> tsc -p tsconfig.json

> @internal/backend@0.0.1 test
> jest

PASS src/service-requests/service-requests.service.spec.ts
PASS src/app.controller.spec.ts
Test Suites: 2 passed, 2 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Ran all test suites.

> internal-operations-service-hub@1.0.0 test:backend:e2e
> npm run build --workspace=@internal/shared && npm run test:e2e --workspace=@internal/backend

> @internal/shared@0.0.1 build
> tsc -p tsconfig.json

> @internal/backend@0.0.1 test:e2e
> jest --config ./test/jest-e2e.json

PASS test/app.e2e-spec.ts
  AppController (e2e) [isolated test.db]
    ✓ 2-Backend-to-database integration test: Should persist and retrieve a ServiceRequest via SQLite
    ✓ 3-Meaningful E2E test: Full POST -> PATCH -> GET lifecycle (Submitted -> In Progress -> Resolved)
    ✓ Authorization allowed: PATCH with x-user-role operator succeeds (200)
    ✓ Authorization denied: PATCH without role header returns 403
    ✓ Authorization denied: PATCH with non-operator role returns 403
    ✓ Invalid request: POST with empty title returns 400
    ✓ Invalid request: POST with missing category returns 400
    ✓ Invalid request: PATCH with unknown status returns 400
    ✓ Invalid transition: Submitted -> Resolved returns 400
    ✓ Expected failure: GET non-existent ID returns 404
    ✓ Expected failure: PATCH non-existent ID returns 404
    ✓ Immutable: PATCH on Resolved request returns 422
    ✓ Invalid request: POST with unknown category returns 400
    ✓ Approval gating: Submitted -> Pending Approval -> In Progress succeeds
    ✓ Immutable: PATCH on Declined request returns 422

Test Suites: 1 passed, 1 total
Tests:       15 passed, 15 total
Snapshots:   0 total
Ran all test suites.
```

**Total: 19 tests green (4 unit + 15 e2e). Zero failures. E2E runs against isolated `prisma/test.db`; `prisma/dev.db` hash verified unchanged before/after.**

## 5. Files Created or Modified (Week 3 hardening + Steps A–E remediation)

### New Files
| File | Purpose |
| :--- | :--- |
| `packages/shared/package.json` | Workspace contract package `@internal/shared` |
| `packages/shared/src/index.ts` | Explicit API contract: statuses, categories, DTO interfaces, `USER_ROLE_HEADER`, `OPERATOR_ROLES`, strict `ALLOWED_TRANSITIONS`, routes |
| `apps/backend/src/service-requests/auth.guard.ts` | `x-user-role operator/admin` guard -> `403` otherwise, applied to `PATCH :id/status` |
| `apps/frontend/src/app/page.tsx` | Dashboard UI (typed with `ServiceRequest`, `force-dynamic`, all-state badges/controls) |
| `apps/frontend/src/app/actions.ts` | Server Actions (forwards shared `OPERATOR_ROLES[0]`, shared routes, env-based API base) |
| `apps/backend/src/service-requests/service-requests.service.spec.ts` | Business-rule + regression tests (typed fixtures, zero `any`) |
| `apps/backend/test/app.e2e-spec.ts` | Integration + lifecycle E2E + all boundary cases (15 tests, isolated `test.db`) |
| `apps/backend/test/test-database.ts` | `ensureTestDatabase` / `cleanupTestDatabase` helper (auto-migrates `test.db`) |
| `apps/backend/test/setup-e2e.ts` | Jest `setupFiles`: forces `DATABASE_URL=file:./test.db` |
| `apps/backend/.env.example` | Documents `DATABASE_URL=file:./dev.db` + test-DB override |
| `apps/backend/.env.test` | Documents `DATABASE_URL=file:./test.db` for manual test-DB runs |

### Modified Files
| File | Change |
| :--- | :--- |
| `package.json` (root) | Added `test` (`test:backend && test:backend:e2e`), `build`, `start:frontend` scripts |
| `apps/backend/src/main.ts` | Global `ValidationPipe({whitelist, forbidNonWhitelisted, transform})` + `enableCors()` |
| `apps/backend/src/prisma/prisma.service.ts` | Loads `dotenv/config`, passes explicit `datasourceUrl` (dev default `file:./dev.db`, e2e override `file:./test.db`) |
| `apps/backend/prisma/schema.prisma` | `datasource url = env("DATABASE_URL")` (was hardcoded `file:./dev.db`) |
| `apps/backend/src/service-requests/service-requests.service.ts` | Uses strict shared `ALLOWED_TRANSITIONS`; maps Prisma rows to shared contract via `toContract`; typed `includes` |
| `apps/backend/src/service-requests/service-requests.controller.ts` | `@UseGuards(AuthGuard)` on `PATCH :id/status` |
| `apps/backend/src/service-requests/dto/create-service-request.dto.ts` | Implements shared contract + `@IsString/@IsNotEmpty/@IsIn(SERVICE_REQUEST_CATEGORIES)`; `category: ServiceRequestCategory`; `strict` initializers |
| `apps/backend/src/service-requests/dto/update-service-request-status.dto.ts` | Implements shared contract + `@IsIn(SERVICE_REQUEST_STATUSES)`; `strict` initializers |
| `apps/backend/src/service-requests/entities/service-request.entity.ts` | Shared `ServiceRequestStatus` + `ServiceRequestCategory`; `strict` initializers |
| `apps/backend/tsconfig.json` | `strict: true` (was `noImplicitAny/strictNullChecks: false`) |
| `apps/backend/test/jest-e2e.json` | Added `setupFiles: setup-e2e.ts` (+ existing `testTimeout: 60000`) |
| `apps/backend/.gitignore` | Ignores `prisma/test.db*` |
| `apps/backend/package.json` | `class-validator`, `class-transformer`, `@internal/shared` |
| `apps/frontend/package.json` | `@internal/shared` |
| `apps/frontend/src/app/page.tsx` | Env-based API base, `force-dynamic`, shared `OPERATOR_ROLES`, all-state badges (`Submitted/Pending Approval/In Progress/Blocked/Resolved/Declined`) |
| `apps/frontend/src/app/actions.ts` | Env-based API base, shared `OPERATOR_ROLES` |
| `packages/shared/src/index.ts` | `category: ServiceRequestCategory`, `Record<ServiceRequestStatus, ...>` transitions incl. `Submitted -> Pending Approval/Declined` |
| `README.md` | `npm test`, DB isolation, PowerShell-safe curls (incl. category `400`, `422`, approval gating), updated counts/structure |
| `docs/week3-full-stack-delivery.md` | This document (19-test output, reconciled machine, isolation proof) |

### Deferred by design (traceability note)
Full `data-model.md` entities (`User`, `ApprovalStep`, `AuditEntry`, `Queue`) and `ADR-001` dual-write audit log remain intentionally deferred past this bounded slice (single `ServiceRequest` table, SQLite). No AI, no external APIs, no CI/CD added.

### Out-of-scope (deliberately NOT added)
No AI, no external APIs, no CI/CD.
