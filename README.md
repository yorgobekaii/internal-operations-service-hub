# **Internal Request Management System**

A centralized internal request intake and management platform designed to eliminate fragmented communication channels, establish deterministic lifecycle management, and enforce role-based operational queues.

## **Project Overview**

This repository represents the **v0.1 Product Foundation** for the Internal Request Management System. It establishes the core product specification, operational architecture, relational data model, and architectural decision record (ADR).

## **Repository Structure**

```text
.
├── apps/
│   ├── backend/              # NestJS Core API (v0.2 Foundation)
│   └── frontend/             # Future React/NextJS application
├── packages/
│   └── shared/               # Shared DTOs, Enums, and Types
├── docs/                     # Project documentation
└── package.json              # NPM Workspaces Root
```

## **Documentation Overview**

> * [**Product Specification (product-spec.md)**](http://docs.google.com/docs/product-spec.md)**:** Defines the intake pillars, dynamic forms, impact-based priority scoring, and deterministic state transitions (Submitted → Pending Approval → In Progress → Blocked → Resolved / Declined).  
> * [**System Architecture (architecture.md)**](http://docs.google.com/docs/architecture.md)**:** Outlines system boundaries, role-based access control (RBAC), decoupled notification handlers, and operational resilience mechanisms.  
> * [**Data Model (data-model.md)**](http://docs.google.com/docs/data-model.md)**:** Details domain entities (Users, Requests, Approvals, Audit Logs), relationship cardinalities, lifecycle invariants, relational PostgreSQL storage choices, and index optimizations for queue queries.  
> * [**Architecture Decision Record (ADR-001.md)**](http://docs.google.com/docs/decisions/ADR-001.md)**:** Documents the architectural tradeoff between state overwriting, append-only event sourcing, and our selected dual-storage strategy for complete request auditability.

## **Evaluation Criteria Alignment (v0.1 Foundation)**

> * **Coherence:** All specification, architectural, and data modeling choices directly map back to internal intake requirements.  
> * **Data Model Reasoning:** Relational storage is justified through strict transactional constraints on state machine transitions.  
> * **Traceability:** Every design choice is traceable from product spec requirements to architecture and data schemas.

## **v0.2 Milestone: Quick Start & Verification**

The v0.2 milestone implements the foundational NestJS application and an in-memory state machine for the service-requests lifecycle. 

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
