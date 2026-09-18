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

For subsequent schema changes, use:

```bash
npm run prisma:push --workspace=@internal/backend
```

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

In a separate terminal, from the frontend workspace:

```bash
cd apps/frontend
npm run dev -- -p 3001
```

The Next.js dashboard will be available at **`http://localhost:3001`**.

Exercise the flow in the UI:
1. Open `http://localhost:3001`, submit Title `Need access to Jira`, Category `IT` -> appears as `Submitted`.
2. Click **Start Work** -> becomes `In Progress` (Server Action sends `PATCH` with `x-user-role: operator`).
3. Click **Resolve** -> becomes `Resolved`.

### **5. Exercise the Flow via curl (same contract as the UI)**

```bash
# Create (201, status Submitted)
curl -X POST http://localhost:3000/service-requests \
 -H "Content-Type: application/json" \
 -d '{"title": "Need new laptop", "category": "IT"}'
# Save the returned "id" as ID below.

# List
curl http://localhost:3000/service-requests

# Get one
curl http://localhost:3000/service-requests/<ID>

# Allowed: Submitted -> In Progress with operator role (200)
curl -X PATCH http://localhost:3000/service-requests/<ID>/status \
 -H "Content-Type: application/json" \
 -H "x-user-role: operator" \
 -d '{"status": "In Progress"}'

# Denied: same request without role (403)
curl -X PATCH http://localhost:3000/service-requests/<ID>/status \
 -H "Content-Type: application/json" \
 -d '{"status": "Resolved"}'

# Valid: In Progress -> Resolved (200)
curl -X PATCH http://localhost:3000/service-requests/<ID>/status \
 -H "Content-Type: application/json" \
 -H "x-user-role: operator" \
 -d '{"status": "Resolved"}'

# Expected failure: bad ID (404)
curl http://localhost:3000/service-requests/non-existent-id

# Invalid: bad payload (400)
curl -X POST http://localhost:3000/service-requests \
 -H "Content-Type: application/json" \
 -d '{"title": "", "category": "IT"}'
```

### **6. Run the Test Suite**

**Unit & business-rule tests** (Jest, 4 tests):

```bash
npm run test:backend
```

**E2E / integration tests** (Jest + Supertest against real SQLite, 12 tests — includes auth 403, invalid 400, missing 404, immutable 422, full POST -> PATCH -> GET lifecycle):

```bash
npm run test:backend:e2e
```

All 16 tests (4 unit + 12 e2e) must pass. See `docs/week3-full-stack-delivery.md` for the exact passing output.

---

## **Repository Structure**

```text
.
├── apps/
│   ├── backend/                        # NestJS Core API
│   │   ├── prisma/
│   │   │   ├── schema.prisma           # Prisma schema (ServiceRequest model)
│   │   │   └── dev.db                  # SQLite database (auto-generated)
│   │   ├── src/
│   │   │   ├── prisma/                 # PrismaService & PrismaModule
│   │   │   ├── service-requests/       # Controller, Service, AuthGuard, DTOs, Entities
│   │   │   ├── app.module.ts           # Root NestJS module
│   │   │   └── main.ts                 # Entry point (port 3000, CORS + ValidationPipe)
│   │   └── test/                       # E2E / integration tests (12 tests)
│   └── frontend/                       # Next.js App Router (React + Tailwind CSS)
│       └── src/app/
│           ├── page.tsx                # Dashboard UI (typed with @internal/shared)
│           └── actions.ts              # Server Actions (POST/PATCH + x-user-role)
├── packages/
│   └── shared/                         # Explicit API contract (statuses, DTOs, transitions, roles)
│       ├── src/index.ts                # Source (run `npm run build:shared` to compile)
│       └── dist/                       # Compiled output (generated, git-ignored)
├── docs/                               # Project documentation
└── package.json                        # NPM Workspaces root
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

---