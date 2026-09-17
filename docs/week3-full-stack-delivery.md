# Week 3 — Full-Stack Delivery & Confidence Suite

## 1. Completed Flow Description

### Narrow Service Request flow (explicit API contract)

`Next.js frontend -> NestJS backend -> Prisma/SQLite`, typed by `@internal/shared`:

1. **Contract (`packages/shared/src/index.ts`)** — explicit, imported both sides:
   - `ServiceRequestStatus`, `CreateServiceRequestDto`, `UpdateServiceRequestStatusDto`, `ServiceRequest`
   - `USER_ROLE_HEADER='x-user-role'`, `OPERATOR_ROLES=['operator','admin']`, `ALLOWED_TRANSITIONS`, `SERVICE_REQUEST_ROUTES`
   - Backend imports it in `service-requests.service.ts`, `dto/*.ts`, `auth.guard.ts`, `entities/service-request.entity.ts`
   - Frontend imports it in `src/app/actions.ts` (`SERVICE_REQUEST_ROUTES`, `USER_ROLE_HEADER`, `ServiceRequestStatus`) and `src/app/page.tsx` (`ServiceRequest`)
2. **Frontend (Next.js App Router)** — `apps/frontend` on `http://localhost:3001`:
   - Dashboard `page.tsx` fetches `GET /service-requests`, renders submit form + list.
   - Server Action `createServiceRequest` sends `POST /service-requests {title, category}`.
   - Server Action `updateServiceRequestStatus(id, status)` sends `PATCH /service-requests/:id/status {status}` with `x-user-role: operator`.
   - `revalidatePath('/')` re-renders `Submitted`, `Start Work -> In Progress`, `Resolve -> Resolved`.
3. **Backend (NestJS)** — `apps/backend` on `http://localhost:3000`:
   - `POST /service-requests` -> `create()` persists `status='Submitted'`, returns `201`.
   - `GET /service-requests` -> `findAll()` ordered `createdAt desc`.
   - `GET /service-requests/:id` -> `findOne()` or `404`.
   - `PATCH /service-requests/:id/status` -> `AuthGuard` then `updateStatus()` against `ALLOWED_TRANSITIONS`, returns `200` or `400/403/404/422`.
4. **Persistence (SQLite via Prisma)** — `apps/backend/prisma/schema.prisma`:
   - `ServiceRequest { id uuid, title, category, status default Submitted, createdAt, updatedAt }`
   - File DB `apps/backend/prisma/dev.db`, managed with `npx prisma generate` + `npx prisma db push`.

## 2. Enforced Boundaries & Business Rules

### State machine (`ALLOWED_TRANSITIONS` in shared, enforced in `ServiceRequestsService`)

| From State | Allowed Transitions |
| :--- | :--- |
| **Submitted** | `In Progress` |
| **In Progress** | `Resolved`, `Blocked`, `Declined` |
| **Blocked** | `In Progress`, `Declined` |
| **Pending Approval** | `In Progress`, `Declined` |
| **Resolved** | *(Immutable)* |
| **Declined** | *(Immutable)* |

### Boundary rules (all proven by e2e tests)

| Rule | Allowed case | Denied / rejected case | Code |
| :--- | :--- | :--- | :--- |
| **Authorization** (`auth.guard.ts` on `PATCH :id/status`, `x-user-role` must be `operator`/`admin`) | `PATCH` with `x-user-role: operator` -> `200` | `PATCH` without header -> `403 Forbidden`; `PATCH` with `x-user-role: viewer` -> `403` | `403` |
| **Invalid request** (`ValidationPipe` + DTO `@IsString/@IsNotEmpty/@IsIn`, + transition check) | valid `POST {title, category}` -> `201` | `POST {title:''}` -> `400`; `POST` missing `category` -> `400`; `PATCH {status:'Flying'}` -> `400`; `Submitted -> Resolved` skip -> `400` | `400` |
| **Expected failure** (`findOne` throws `NotFoundException`) | `GET /:id` existing -> `200` | `GET /non-existent-id` -> `404`; `PATCH /non-existent-id/status` -> `404` | `404` |
| **Immutability** | `In Progress -> Resolved` -> `200` | `Resolved -> In Progress` -> `422 Unprocessable Entity` | `422` |

## 3. Automated Confidence Suite (all passing)

| Required type | File | Test name | What it proves |
| :--- | :--- | :--- | :--- |
| **1 Business-rule** | `src/service-requests/service-requests.service.spec.ts` | `1-Business-rule test: should reject invalid state transition from Submitted to Resolved` | Service rejects `Submitted -> Resolved` with `BadRequestException` (mocked Prisma) |
| **1 Backend-to-DB integration** | `test/app.e2e-spec.ts` | `2-Backend-to-database integration test` | Real `POST` persists to SQLite, real `GET /:id` returns same record |
| **1 Meaningful E2E** | `test/app.e2e-spec.ts` | `3-Meaningful E2E test: Full POST -> PATCH -> GET lifecycle` | Real `POST (Submitted) -> PATCH In Progress (operator) -> PATCH Resolved (admin) -> GET` verifies persisted `Resolved` |
| **1 Regression** | `src/service-requests/service-requests.service.spec.ts` | `4-Regression test: should allow valid transition from Submitted to In Progress` | Previously working `Submitted -> In Progress` still returns updated status |

Additional boundary e2e cases in same file: auth allowed (`operator -> 200`), auth denied (no header `-> 403`, `viewer -> 403`), bad payloads (`400 x3`), illegal skip (`400`), missing IDs (`404 x2`), immutable (`422`).

## 4. Passing Test Execution Output (exact)

```
> @internal/backend@0.0.1 test
> jest

PASS src/service-requests/service-requests.service.spec.ts (5.223 s)
PASS src/app.controller.spec.ts (5.225 s)

Test Suites: 2 passed, 2 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        6.441 s, estimated 21 s
Ran all test suites.
```

```
> @internal/backend@0.0.1 test:e2e
> jest --config ./test/jest-e2e.json

PASS test/app.e2e-spec.ts (7.388 s)
  AppController (e2e)
    ✓ 2-Backend-to-database integration test: Should persist and retrieve a ServiceRequest via SQLite (97 ms)
    ✓ 3-Meaningful E2E test: Full POST -> PATCH -> GET lifecycle (Submitted -> In Progress -> Resolved) (49 ms)
    ✓ Authorization allowed: PATCH with x-user-role operator succeeds (200) (26 ms)
    ✓ Authorization denied: PATCH without role header returns 403 (18 ms)
    ✓ Authorization denied: PATCH with non-operator role returns 403 (16 ms)
    ✓ Invalid request: POST with empty title returns 400 (6 ms)
    ✓ Invalid request: POST with missing category returns 400 (6 ms)
    ✓ Invalid request: PATCH with unknown status returns 400 (15 ms)
    ✓ Invalid transition: Submitted -> Resolved returns 400 (19 ms)
    ✓ Expected failure: GET non-existent ID returns 404 (6 ms)
    ✓ Expected failure: PATCH non-existent ID returns 404 (5 ms)
    ✓ Immutable: PATCH on Resolved request returns 422 (40 ms)

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        7.795 s, estimated 10 s
Ran all test suites.
```

**Total: 16 tests green (4 unit + 12 e2e). Zero failures.**

## 5. Files Created or Modified (Week 3 hardening)

### New Files
| File | Purpose |
| :--- | :--- |
| `packages/shared/package.json` | Workspace contract package `@internal/shared` |
| `packages/shared/src/index.ts` | Explicit API contract: statuses, DTO interfaces, `USER_ROLE_HEADER`, `OPERATOR_ROLES`, `ALLOWED_TRANSITIONS`, routes |
| `apps/backend/src/service-requests/auth.guard.ts` | `x-user-role operator/admin` guard -> `403` otherwise, applied to `PATCH :id/status` |
| `apps/frontend/src/app/page.tsx` | Dashboard UI (already existed, now typed with `ServiceRequest`) |
| `apps/frontend/src/app/actions.ts` | Server Actions (now forwards `x-user-role: operator`, uses shared routes/types) |
| `apps/backend/src/service-requests/service-requests.service.spec.ts` | Business-rule + regression tests |
| `apps/backend/test/app.e2e-spec.ts` | Integration + lifecycle E2E + all boundary cases (12 tests) |

### Modified Files
| File | Change |
| :--- | :--- |
| `apps/backend/src/main.ts` | Added global `ValidationPipe({whitelist, forbidNonWhitelisted, transform})` + kept `enableCors()` |
| `apps/backend/src/service-requests/service-requests.service.ts` | Uses `ALLOWED_TRANSITIONS` from shared; added missing-status `400` guard |
| `apps/backend/src/service-requests/service-requests.controller.ts` | Added `@UseGuards(AuthGuard)` on `PATCH :id/status` |
| `apps/backend/src/service-requests/dto/create-service-request.dto.ts` | Implements shared contract + `@IsString/@IsNotEmpty` |
| `apps/backend/src/service-requests/dto/update-service-request-status.dto.ts` | Implements shared contract + `@IsIn(SERVICE_REQUEST_STATUSES)` |
| `apps/backend/src/service-requests/entities/service-request.entity.ts` | Re-exports `ServiceRequestStatus` from shared |
| `apps/backend/test/jest-e2e.json` | Added `testTimeout: 60000` for slow CI machines |
| `apps/backend/package.json` | Added `class-validator`, `class-transformer`, `@internal/shared` |
| `apps/frontend/package.json` | Added `@internal/shared` |
| `apps/frontend/src/app/page.tsx` | Typed `requests: ServiceRequest[]`, removed `any` |
| `README.md` | Full setup/flow/test instructions, fixed curls, auth headers |
| `docs/week3-full-stack-delivery.md` | This document |

### Out-of-scope (deliberately NOT added)
No AI, no external APIs, no CI/CD.
