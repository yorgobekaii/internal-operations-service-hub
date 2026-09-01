# Data Model Specification

## Summary
Defines the structural data design, domain entity relationships, storage strategy, and lifecycle state management rules.

### Key Elements
- **Domain Entities:** User, Role, Department, Category, Request, ApprovalGate, AuditLog, Comment.
- **Lifecycle & Rules:** Deterministic state machine enforcement, authorization-sensitive row-level read access, and immutable audit logs.
- **Storage Strategy:** Relational schema with durable storage for core requests/users and event-driven logging for timeline state tracking.
