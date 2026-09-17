# **Internal Request Management System**

A centralized internal request intake and management platform designed to eliminate fragmented communication channels, establish deterministic lifecycle management, and enforce role-based operational queues.

## **Project Overview**

This repository represents the **Internal Request Management System**, progressing from a v0.1 product foundation through a full-stack vertical slice. It establishes the core product specification, operational architecture, relational data model, architectural decision record (ADR), and a working end-to-end implementation with a Next.js frontend, NestJS backend, and SQLite database via Prisma ORM.

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

### **1. Install Dependencies**

From the repository root (this bootstraps all workspaces including `apps/backend` and `apps/frontend`):

```bash
npm install
```

### **2. Initialize the Database**

Navigate to the backend workspace and push the Prisma schema to create the SQLite database:

```bash
cd apps/backend
npx prisma db push
```

This creates `apps/backend/prisma/dev.db` with the `ServiceRequest` table. For subsequent schema changes, use:

```bash
npx prisma migrate dev --name <migration_name>
```

### **3. Start the Backend**

From the repository root:

```bash
npm run start:backend
```

Or directly from the backend workspace:

```bash
cd apps/backend
npm run start:dev
```

The NestJS API will be available at **`http://localhost:3000`**.

### **4. Start the Frontend**

In a separate terminal, from the frontend workspace:

```bash
cd apps/frontend
npm run dev -- -p 3001
```

The Next.js dashboard will be available at **`http://localhost:3001`**.

### **5. Run the Test Suite**

**Unit & business-rule tests** (Jest):

```bash
cd apps/backend
npm test
```

**E2E / integration tests** (Jest + Supertest against real SQLite):

```bash
cd apps/backend
npm run test:e2e
```

**Run everything from the repo root:**

```bash
npm run test:backend
```

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
│   │   │   ├── service-requests/       # Controller, Service, DTOs, Entities
│   │   │   ├── app.module.ts           # Root NestJS module
│   │   │   └── main.ts                 # Application entry point (port 3000)
│   │   └── test/                       # E2E / integration tests
│   └── frontend/                       # Next.js App Router (React + Tailwind CSS)
│       └── src/app/
│           ├── page.tsx                # Dashboard UI (submit form + request list)
│           └── actions.ts              # Server Actions (POST/PATCH to backend)
├── packages/
│   └── shared/                         # Shared DTOs, Enums, and Types
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

## **Evaluation Criteria Alignment (v0.1 Foundation)**

> * **Coherence:** All specification, architectural, and data modeling choices directly map back to internal intake requirements.  
> * **Data Model Reasoning:** Relational storage is justified through strict transactional constraints on state machine transitions.  
> * **Traceability:** Every design choice is traceable from product spec requirements to architecture and data schemas.

---

## **v0.2 Milestone: State Machine Verification**

The v0.2 milestone implements the foundational NestJS application and the state machine for the service-requests lifecycle. Use the following curl commands to verify the 4 core invariants.

### **Setup & Startup**
1. Install dependencies from the root (this will bootstrap all workspaces):
   ```bash
   npm install
   ```
2. Start the development server for the backend workspace:
   ```bash
   npm run start:backend
   ```
   The API will be available at `http://localhost:3000`.

### **Testing the State Machine**
Verify the 4 core state machine invariants using the following curl commands.

#### **1. Create Request (Initializes as `Submitted`)**
```bash
curl -X POST http://localhost:3000/service-requests \
-H "Content-Type: application/json" \
-d '{"title": "Need new laptop", "category": "IT"}'
```
*Expected Output: `201 Created` with `{"status": "Submitted", ...}`*

#### **2. Valid Transition: `Submitted` -> `In Progress`**
```bash
curl -X PATCH http://localhost:3000/service-requests/1/status \
-H "Content-Type: application/json" \
-d '{"status": "In Progress"}'
```
*Expected Output: `200 OK` with `{"status": "In Progress", ...}`*

#### **3. Valid Transition: `In Progress` -> `Resolved`**
```bash
curl -X PATCH http://localhost:3000/service-requests/1/status \
-H "Content-Type: application/json" \
-d '{"status": "Resolved"}'
```
*Expected Output: `200 OK` with `{"status": "Resolved", ...}`*

#### **4. Invalid Transition: Mutating Immutable State (Fails)**
Once a request is `Resolved`, it cannot be updated.
```bash
curl -X PATCH http://localhost:3000/service-requests/1/status \
-H "Content-Type: application/json" \
-d '{"status": "In Progress"}'
```
*Expected Output: `422 Unprocessable Entity` with message "Request is immutable and cannot be updated"*

#### **Bonus: Invalid Transition: Skipping States (Fails)**
You cannot transition directly from `Submitted` to `Resolved`.
```bash
# Create a new request (ID: 2)
curl -X POST http://localhost:3000/service-requests \
-H "Content-Type: application/json" \
-d '{"title": "Software License", "category": "IT"}'

# Attempt illegal skip
curl -X PATCH http://localhost:3000/service-requests/2/status \
-H "Content-Type: application/json" \
-d '{"status": "Resolved"}'
```
*Expected Output: `400 Bad Request` with message "Invalid state transition"*
