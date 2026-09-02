# **Internal Request Management System**

A centralized internal request intake and management platform designed to eliminate fragmented communication channels, establish deterministic lifecycle management, and enforce role-based operational queues.

## **Project Overview**

This repository represents the **v0.1 Product Foundation** for the Internal Request Management System. It establishes the core product specification, operational architecture, relational data model, and architectural decision record (ADR).

## **Repository Structure**

`.`  
`├── README.md                 # Project entry point and foundational overview`  
`└── docs/`  
    `├── product-spec.md       # Product requirements, functional pillars, and user workflows`  
    `├── architecture.md       # System boundaries, component layout, and operational security`  
    `├── data-model.md         # Domain entities, deterministic state machine, and indexing strategy`  
    `└── decisions/`  
        `└── ADR-001.md        # Decision record: Audit history tracking vs. state overwriting`

## **Documentation Overview**

> * [**Product Specification (product-spec.md)**](http://docs.google.com/docs/product-spec.md)**:** Defines the intake pillars, dynamic forms, impact-based priority scoring, and deterministic state transitions (Submitted → Pending Approval → In Progress → Blocked → Resolved / Declined).  
> * [**System Architecture (architecture.md)**](http://docs.google.com/docs/architecture.md)**:** Outlines system boundaries, role-based access control (RBAC), decoupled notification handlers, and operational resilience mechanisms.  
> * [**Data Model (data-model.md)**](http://docs.google.com/docs/data-model.md)**:** Details domain entities (Users, Requests, Approvals, Audit Logs), relationship cardinalities, lifecycle invariants, relational PostgreSQL storage choices, and index optimizations for queue queries.  
> * [**Architecture Decision Record (ADR-001.md)**](http://docs.google.com/docs/decisions/ADR-001.md)**:** Documents the architectural tradeoff between state overwriting, append-only event sourcing, and our selected dual-storage strategy for complete request auditability.

## **Evaluation Criteria Alignment (v0.1 Foundation)**

> * **Coherence:** All specification, architectural, and data modeling choices directly map back to internal intake requirements.  
> * **Data Model Reasoning:** Relational storage is justified through strict transactional constraints on state machine transitions.  
> * **Traceability:** Every design choice is traceable from product spec requirements to architecture and data schemas.