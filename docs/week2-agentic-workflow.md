# Week 2 Agentic Workflow

## UNDERSTAND

- **Core Entity:** `Request` (will be mapped to `ServiceRequest` in code for clarity against HTTP requests).
- **Full Set of States Defined:** `Submitted`, `Pending Approval`, `In Progress`, `Blocked`, `Resolved`, `Declined`.
- **Key Business Invariants:**
  1. **Approval Invariant:** A request cannot enter `In Progress` if any required approval steps remain pending.
  2. **Immutability Invariant:** Once a request reaches `Resolved` or `Declined`, its core payload and state become strictly immutable.
  3. **Audit Invariant:** Every state transition must atomically record an immutable history/audit event.

## DIRECT

### Bounded Lifecycle Slice Definition
1. **States Selected:** `Submitted`, `In Progress`, `Resolved`.
2. **Valid Transitions (2+):**
   - **Transition 1:** [`Submitted` -> `In Progress`] — A request with no approval requirements is picked up by a designated queue owner to begin fulfillment.
   - **Transition 2:** [`In Progress` -> `Resolved`] — The assigned owner successfully completes the requested operational fulfillment.
3. **Invalid Transitions (2+):**
   - **Rejected Transition 1:** [`Submitted` -> `Resolved`] — Cannot resolve a request before it has been worked on. (Error code: `400 Bad Request` / `INVALID_STATE_TRANSITION`).
   - **Rejected Transition 2:** [`Resolved` -> `In Progress`] — Cannot revert a completed request back to a working state due to the immutability invariant. (Error code: `422 Unprocessable Entity` / `REQUEST_IMMUTABLE`).
4. **Primary Invariant:**
   - **Immutability Invariant:** Once a request transitions to `Resolved`, it is considered locked. The state machine must reject any further status updates.

### NestJS Technical Mapping
- **Endpoints / Routes:**
  - `POST /service-requests` — Creates a request (Defaults to `Submitted`). Accepts `CreateServiceRequestDto`.
  - `PATCH /service-requests/:id/status` — Progresses the lifecycle state. Accepts `UpdateServiceRequestStatusDto`.
  - `GET /service-requests/:id` — Fetches a request to verify its current state.
- **Service & In-Memory Store:**
  - The `ServiceRequestsService` will instantiate a private `Map<string, ServiceRequest>` as the in-memory data store.
  - State machine rules will be hard-coded into the service's `updateStatus` method via a switch-case or conditionals.
  - Exceptions (`BadRequestException`, `UnprocessableEntityException`) will be thrown for invalid state combinations.

## PROVE

### Verification & Evidence Strategy
- **Expected Valid Cycles:**
  - Creating a request responds with `201 Created` and `{ "status": "Submitted" }`.
  - Updating from `Submitted` to `In Progress`, and then `In Progress` to `Resolved` responds with `200 OK` and returns the newly transitioned state.
- **Expected Invalid Responses:**
  - Updating directly from `Submitted` to `Resolved` triggers a `400 Bad Request` exception.
  - Updating a `Resolved` request triggers a `422 Unprocessable Entity` exception indicating the record is immutable.
- **Verification Commands:**
  ```bash
  # 1. Create Request
  curl -X POST http://localhost:3000/service-requests -H "Content-Type: application/json" -d '{"title": "Need new laptop", "category": "IT"}'
  
  # 2. Valid Transition (Submitted -> In Progress)
  curl -X PATCH http://localhost:3000/service-requests/1/status -H "Content-Type: application/json" -d '{"status": "In Progress"}'

  # 3. Valid Transition (In Progress -> Resolved)
  curl -X PATCH http://localhost:3000/service-requests/1/status -H "Content-Type: application/json" -d '{"status": "Resolved"}'

  # 4. Invalid Transition (Immutable State Mutation)
  curl -X PATCH http://localhost:3000/service-requests/1/status -H "Content-Type: application/json" -d '{"status": "In Progress"}'
  ```

