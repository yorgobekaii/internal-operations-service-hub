# **Internal Request Management System**

A centralized internal request intake and management platform designed to eliminate fragmented communication channels, establish deterministic lifecycle management, and enforce role-based operational queues.

## **Project Overview**

This repository represents the **Internal Request Management System**, progressing from a v0.1 product foundation through a full-stack vertical slice. It establishes the core product specification, operational architecture, relational data model, architectural decision record (ADR), and a working end-to-end implementation with a Next.js frontend, NestJS backend, and SQLite database via Prisma ORM.

> * **Coherence:** All specification, architectural, and data modeling choices directly map back to internal intake requirements.  
> * **Data Model Reasoning:** Relational storage is justified through strict transactional constraints on state machine transitions.  
> * **Traceability:** Every design choice is traceable from product spec requirements to architecture and data schemas.

---

## **Prerequisites**

Ensure the following are installed before running the project:

| Tool | Version | Purpose |
| :--- | :------ | :------ |
| **Node.js** | >= 20.x | JavaScript runtime |
| **npm** | >= 10.x | Package manager (ships with Node.js) |
| **SQLite** | 3.x | Embedded database (used automatically via Prisma — no separate install needed) |
| **Prisma CLI** | >= 6.x | Installed as a dev dependency; no global install required |

---

## **Getting Started**

From the repository root, run these three commands. No prior setup is assumed beyond Node.js:

```bash
npm install
npm run setup
npm run start:backend
```

### **1. Install Dependencies**

```bash
npm install
```

### **2. Setup (build shared contract + create database)**

```bash
npm run setup
```

This builds `packages/shared` to plain JavaScript and creates `apps/backend/prisma/dev.db` with the `ServiceRequest` table. It runs:

```bash
npm run build --workspace=@internal/shared
npm run prisma:push --workspace=@internal/backend
```

`prisma:push` is a workspace wrapper around `prisma db push` (equivalent to running `npx prisma db push` inside `apps/backend`). The datasource URL comes from `apps/backend/.env` (`DATABASE_URL="file:./dev.db"` — copy `apps/backend/.env.example` to `apps/backend/.env` on a fresh clone). For subsequent schema changes, use:

```bash
npm run prisma:push --workspace=@internal/backend
```

> **DB isolation:** E2E tests NEVER touch `dev.db`. They auto-create/migrate `apps/backend/prisma/test.db` (`DATABASE_URL=file:./test.db`, see `apps/backend/test/setup-e2e.ts` + `apps/backend/test/test-database.ts` + `apps/backend/.env.test`). Running the e2e suite leaves `dev.db` byte-identical (verified by hash before/after).

### **3. Start the Backend**

```bash
npm run start:backend
```

The NestJS API will be available at **`http://localhost:3000`**. (`start:backend` rebuilds the shared contract automatically, so step 2 only needs to run once.) Health check:

```bash
curl http://localhost:3000/service-requests
```
*Expected: `200 OK` with `[]` or a JSON array.*

### **4. Start the Frontend**

In a separate terminal, from the repository root:

```bash
npm run start:frontend
```

(equivalent to `cd apps/frontend` + `npm run dev -- -p 3001`). The backend URL is read from `NEXT_PUBLIC_API_URL` with fallback `http://localhost:3000`, so no extra config is needed locally.

The Next.js hub will be available at **`http://localhost:3001`** with three routes: `/` executive dashboard, `/new` intake, `/approvals` approval queue.

Exercise the flow in the UI:
1. Open `http://localhost:3001`, use **AI Intake Assistant**: type `My laptop screen is flickering and won't turn on` -> **Suggest with AI** -> preview `IT / High` -> **Apply & Create Request**.
2. Or file manually on `/new` (Title `Need access to Jira`, Category `IT`, Priority `Standard`) -> appears as `Submitted`.
3. Filter the live queue by category/status/search; click **Start Work** -> `In Progress` (Server Action sends `PATCH` with `x-user-role: operator`); click **Resolve** -> `Resolved`. Pending items are also actionable on `/approvals`.

### **5. Exercise the Flow via curl (same contract as the UI)**

Replace `ID` with the `id` returned by the create call. Each command below is a single line (copy-paste safe in Windows PowerShell, `cmd`, and `bash` — no `\` continuations).

```bash
# Create (201, status Submitted, default priority Standard)
curl -X POST http://localhost:3000/service-requests -H "Content-Type: application/json" -d "{\"title\": \"Need new laptop\", \"category\": \"IT\"}"
# Create with explicit priority (201)
curl -X POST http://localhost:3000/service-requests -H "Content-Type: application/json" -d "{\"title\": \"Need new laptop\", \"category\": \"IT\", \"priority\": \"High\"}"
# Save the returned "id" as ID below.

# AI triage suggest (200, advisory only — never writes to DB)
curl -X POST http://localhost:3000/service-requests/ai-triage -H "Content-Type: application/json" -d "{\"description\": \"My laptop screen is flickering and won't turn on\"}"
# AI triage thin input (400)
curl -X POST http://localhost:3000/service-requests/ai-triage -H "Content-Type: application/json" -d "{\"description\": \"\"}"

# List
curl http://localhost:3000/service-requests

# Get one
curl http://localhost:3000/service-requests/ID

# Allowed: Submitted -> In Progress with operator role (200)
curl -X PATCH http://localhost:3000/service-requests/ID/status -H "Content-Type: application/json" -H "x-user-role: operator" -d "{\"status\": \"In Progress\"}"

# Allowed: Submitted -> Pending Approval with operator role (200, approval gating per product-spec)
curl -X PATCH http://localhost:3000/service-requests/ID/status -H "Content-Type: application/json" -H "x-user-role: operator" -d "{\"status\": \"Pending Approval\"}"

# Denied: same request without role (403)
curl -X PATCH http://localhost:3000/service-requests/ID/status -H "Content-Type: application/json" -d "{\"status\": \"Resolved\"}"

# Valid: In Progress -> Resolved (200)
curl -X PATCH http://localhost:3000/service-requests/ID/status -H "Content-Type: application/json" -H "x-user-role: operator" -d "{\"status\": \"Resolved\"}"

# Expected failure: bad ID (404)
curl http://localhost:3000/service-requests/non-existent-id

# Invalid: bad payload (400)
curl -X POST http://localhost:3000/service-requests -H "Content-Type: application/json" -d "{\"title\": \"\", \"category\": \"IT\"}"

# Invalid: unknown category (400, enforced by @IsIn)
curl -X POST http://localhost:3000/service-requests -H "Content-Type: application/json" -d "{\"title\": \"Bad category\", \"category\": \"Flying\"}"

# Immutable: PATCH on Resolved or Declined (422)
curl -X PATCH http://localhost:3000/service-requests/ID/status -H "Content-Type: application/json" -H "x-user-role: operator" -d "{\"status\": \"In Progress\"}"
```

PowerShell tip: the examples above use backslash-escaped quotes (`\"`) so they work verbatim in both PowerShell and `bash`. In `bash` you may instead use single-quoted bodies, e.g. `-d '{"title": "Need new laptop", "category": "IT"}'`.

### **6. Run the Test Suite**

Full suite from the repository root (unit + isolated e2e, must be green):

```bash
npm test
```

(`npm test` = `npm run test:backend && npm run test:backend:e2e`.)

**Unit & business-rule tests** (Jest, 4 tests):

```bash
npm run test:backend
```

**E2E / integration tests** (Jest + Supertest against a real, isolated SQLite `test.db`, 15 tests — includes auth 403, invalid 400 incl. unknown category, missing 404, immutable 422 for both `Resolved` and `Declined`, approval-gating `Submitted -> Pending Approval -> In Progress`, full POST -> PATCH -> GET lifecycle):

```bash
npm run test:backend:e2e
```

All 19 tests (4 unit + 15 e2e) must pass. See `docs/week3-full-stack-delivery.md` for the exact passing output.

**AI evals (Week 4, 8 cases, mock provider — no key needed):**

```bash
npm run eval:triage
```

(`eval:triage` = `build shared && jest --config ./test/jest-eval.json` — E1 clear IT/HR, E3 thin, E4 ambiguous, E5 Finance high-cost rule, E6 invalid model coercion, E7 provider 502, E8 malformed confidence. All 8 must pass. See `docs/week4-production-ai.md`.)

**Groq (real LLM, optional):** default `AI_PROVIDER=mock` needs no key. Yes — the right procedure is putting values in `apps/backend/.env` (the backend loads that file automatically on boot, no export needed):

```bash
# Inside apps/backend: copy once, then edit .env with real values
Copy-Item .env.example .env   # PowerShell
# cp .env.example .env        # bash
```

Then in `apps/backend/.env` set real values (quotes optional) and **restart** the backend:

```
AI_PROVIDER="groq"
GROQ_API_KEY="gsk_..."              # real key from https://console.groq.com/keys — "value" will NOT work
GROQ_MODEL="openai/gpt-oss-120b"  # current model — llama-3.3-70b-versatile was retired by Groq (Aug 2026) and 404s
```

Check the backend terminal on boot: it logs `[ai-triage] provider=groq:openai/gpt-oss-120b` (live) vs `[ai-triage] provider=mock-local-v1` (mock). Shell exports still work for one-offs and override `.env`, but do NOT export `AI_PROVIDER=groq` globally — tests force mock regardless, but keep shells clean.

Without a real `GROQ_API_KEY`, `POST /service-requests/ai-triage` under `AI_PROVIDER=groq` returns stable `502` (proven by E7), and the UI shows the backend reason.

---

## **Repository Structure**

```text
.
├── apps/
│   ├── backend/                        # NestJS Core API
│   │   ├── prisma/
│   │   │   ├── schema.prisma           # Prisma schema (ServiceRequest model, env-driven DATABASE_URL)
│   │   │   ├── dev.db                  # SQLite dev database (auto-generated, tracked)
│   │   │   └── test.db                 # SQLite isolated e2e database (auto-generated, git-ignored)
│   │   ├── src/
│   │   │   ├── prisma/                 # PrismaService & PrismaModule
│   │   │   ├── service-requests/       # Controller, Service, AuthGuard, DTOs, Entities
│   │   │   ├── app.module.ts           # Root NestJS module
│   │   │   └── main.ts                 # Entry point (port 3000, CORS + ValidationPipe)
│   │   └── test/                       # E2E / integration tests (15 tests, isolated test.db)
│   │       ├── app.e2e-spec.ts         # Integration + lifecycle + boundary cases
│   │       ├── test-database.ts        # ensureTestDatabase / cleanupTestDatabase helper
│   │       └── setup-e2e.ts            # Jest setupFiles: forces DATABASE_URL=test.db
│   └── frontend/                       # Next.js App Router (React + Tailwind CSS)
│       └── src/app/
│           ├── page.tsx                # Dashboard UI (typed with @internal/shared, force-dynamic)
│           └── actions.ts              # Server Actions (POST/PATCH + x-user-role)
├── packages/
│   └── shared/                         # Explicit API contract (statuses, DTOs, transitions, roles)
│       ├── src/index.ts                # Source (run `npm run build:shared` to compile)
│       └── dist/                       # Compiled output (generated, git-ignored)
├── docs/                               # Project documentation
└── package.json                        # NPM Workspaces root (test, build, start:frontend scripts)
```

---

## **Documentation Index**

| Document | Description |
| :------- | :---------- |
| [**product-spec.md**](docs/product-spec.md) | Defines intake pillars, dynamic forms, impact-based priority scoring, and deterministic state transitions (`Submitted` → `Pending Approval` → `In Progress` → `Blocked` → `Resolved` / `Declined`). |
| [**architecture.md**](docs/architecture.md) | Outlines system boundaries, role-based access control (RBAC), decoupled notification handlers, and operational resilience mechanisms. |
| [**data-model.md**](docs/data-model.md) | Details domain entities (Users, Requests, Approvals, Audit Logs), relationship cardinalities, lifecycle invariants, relational storage choices, and index optimizations for queue queries. |
| [**decisions/ADR-001.md**](docs/decisions/ADR-001.md) | Documents the architectural tradeoff between state overwriting, append-only event sourcing, and the selected dual-storage strategy for complete request auditability. |
| [**week2-agentic-workflow.md**](docs/week2-agentic-workflow.md) | Week 2 deliverable: bounded lifecycle slice definition, NestJS technical mapping, and verification strategy. |
| [**week3-full-stack-delivery.md**](docs/week3-full-stack-delivery.md) | Week 3 deliverable: completed full-stack flow description, enforced boundaries, automated confidence suite, and passing test output. |
| [**week4-production-ai.md**](docs/week4-production-ai.md) | Week 4 deliverable: advisory Groq AI triage, priority persistence, context control, 8-case eval suite, and passing logs. |

---