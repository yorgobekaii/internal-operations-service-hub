# Week 4 — Production AI: Advisory Request Intake (Groq)

## 1. What shipped

Advisory-only AI intake: `POST /service-requests/ai-triage` takes free text
`{ "description": "My laptop screen is flickering and won't turn on" }` and
returns a candidate `{ category, title, priority, summary, confidence,
needsHumanReview, modelVersion }`. It never writes to the DB and never changes
request state. Backend/product rules keep final authority.

New persistent field: `ServiceRequest.priority` (`Urgent|High|Standard|Low`,
default `Standard`) is stored in SQLite, accepted optionally on
`POST /service-requests`, and suggested by AI triage.

Provider is Groq (OpenAI-compatible `https://api.groq.com/openai/v1/chat/completions`).
Default remains the deterministic mock so tests/evals never need a key.

## 2. Context control + privacy

- Only the single `description` string is sent to the provider, after `redactPii()`
  (emails → `[redacted-email]`, 6+ digit runs → `[redacted-id]`), truncated to 1500 chars.
- System prompt pins the JSON schema and the closed allowlists; temperature 0,
  `max_tokens: 400`, 8s abort timeout.
- Nothing sensitive is logged; no request history or DB rows leave the service.
- Groq key lives only in env (`GROQ_API_KEY`), never in code/docs. See
  `apps/backend/.env.example`.

```
AI_PROVIDER="mock"   # mock (default) | groq
GROQ_API_KEY=""      # required only for AI_PROVIDER=groq (https://console.groq.com/keys)
GROQ_MODEL="llama-3.3-70b-versatile"
```

Correct procedure (yes — `apps/backend/.env` is the right file; the backend
loads it automatically on boot since v0.4.1, no export needed):

1. Inside `apps/backend`: `Copy-Item .env.example .env` (PowerShell) or `cp .env.example .env` (bash).
2. Edit `.env` with REAL values (`KEY=value`, quotes optional): `AI_PROVIDER="groq"`, `GROQ_API_KEY="gsk_..."` (real key — the literal word `"value"` will NOT work), `GROQ_MODEL="llama-3.3-70b-versatile"` (real model id — `"value"` yields Groq 404 → backend 502).
3. RESTART the backend. Boot log shows `[ai-triage] provider=groq:<model>` (live) vs `[ai-triage] provider=mock-local-v1` (mock).
4. Do NOT export `AI_PROVIDER=groq` globally in test terminals. Tests (`setup-e2e.ts` + `app.e2e-spec.ts`) now force `AI_PROVIDER=mock` regardless of shell env, so a leaked export can no longer flip e2e to Groq (the exact failure mode seen in testing: `expected 200, got 502`).

Run with Groq:

```bash
# PowerShell
$env:AI_PROVIDER="groq"; $env:GROQ_API_KEY="gsk_..."; npm run start:backend
# bash
AI_PROVIDER=groq GROQ_API_KEY="gsk_..." npm run start:backend
```

## 3. Validation rules (backend owns authority)

| Layer | Rule | Effect |
| :--- | :--- | :--- |
| DTO | `description` 3–2000 chars | empty/thin → `400` |
| Client isolation | `ai-triage.client.ts` only place that touches Groq/mock | swap via `AI_PROVIDER` |
| Runtime allowlist | `category ∈ {IT,HR,Finance,Operations}`, `priority ∈ {Urgent,High,Standard,Low}` | unknown → `Operations`/`Standard` fallback, never leaks invalid enum |
| Confidence | `< 0.7 → needsHumanReview=true` | ambiguous/thin flagged, never auto-routed |
| Provider errors | timeout, non-JSON, missing key, HTTP != 2xx | `502 Bad Gateway` with stable shape, never `500` |
| Persistence | `POST /service-requests` accepts optional `priority`, defaults `Standard`; unknown → `400` | old rows backfilled `Standard` |

cURL:

```bash
# Suggest (200, advisory)
curl -X POST http://localhost:3000/service-requests/ai-triage -H "Content-Type: application/json" -d "{\"description\": \"My laptop screen is flickering and won't turn on\"}"
# Thin (400)
curl -X POST http://localhost:3000/service-requests/ai-triage -H "Content-Type: application/json" -d "{\"description\": \"\"}"
# Create with priority (201)
curl -X POST http://localhost:3000/service-requests -H "Content-Type: application/json" -d "{\"title\": \"Need new laptop\", \"category\": \"IT\", \"priority\": \"High\"}"
# Groq without key (502)
curl -X POST http://localhost:3000/service-requests/ai-triage -H "Content-Type: application/json" -d "{\"description\": \"Need VPN access\"}"
```

## 4. Eval suite (8 cases, `npm run eval:triage`)

File: `apps/backend/test/ai-triage.eval.spec.ts` (mock provider pinned, no network).
Runner: root `npm run eval:triage` → `test:eval` (`test/jest-eval.json`).

| # | Case | Input | Expectation |
| :--- | :--- | :--- | :--- |
| E1 | Clear IT | laptop screen flickering, won't turn on | `IT`, conf ≥ 0.7, review=false |
| E2 | Clear HR | parental leave balance | `HR/Standard`, review=false |
| E3 | Thin | `help` / `''` | review=true / `400` |
| E4 | Ambiguous | laptop + payroll onboarding + badge | valid enum, review=true |
| E5 | Trusted context | high-cost $4,500 laptop purchase | `Finance/High`, summary mentions Finance |
| E6 | Invalid model output | `Flying/Cosmic` | coerced `Operations/Standard` |
| E7 | Provider failure | throws `AiProviderError` | `502 BadGatewayException` |
| E8 | Malformed confidence | `NaN` | defaults 0.5, review=true |

## 5. Passing execution logs

Deterministic suite (`npm test`): **4 unit + 18 e2e = 22 green**, including 3 new
e2e cases (ai-triage 200, ai-triage 400, priority persistence). Eval suite:
**8/8 green**. E2E still uses isolated `prisma/test.db`; `dev.db` untouched.

```
> internal-operations-service-hub@1.0.0 test:backend:e2e
> jest --config ./test/jest-e2e.json
PASS test/app.e2e-spec.ts
Tests: 18 passed, 18 total

> internal-operations-service-hub@1.0.0 eval:triage
> jest --config ./test/jest-eval.json
PASS test/ai-triage.eval.spec.ts
Tests: 8 passed, 8 total
```

(Full logs reproduced on run; timings vary per machine, counts/names stable.)

## 6. Files changed (Week 4)

- `packages/shared/src/index.ts` — `ServiceRequestPriority`, `priority?` on create DTO,
  `AiTriageRequest/Suggestion`, `SERVICE_REQUEST_PRIORITIES`, `aiTriage` route.
- `apps/backend/prisma/schema.prisma` — `priority String @default("Standard")`.
- `apps/backend/src/service-requests/dto/ai-triage-request.dto.ts` — new.
- `apps/backend/src/service-requests/dto/create-service-request.dto.ts` — optional priority.
- `apps/backend/src/service-requests/ai/ai-triage.client.ts` — `MockLocalTriageClient`,
  `GroqTriageClient` (Groq OpenAI-compatible), `redactPii`, `createTriageClient`, validator.
- `apps/backend/src/service-requests/ai/ai-triage.service.ts` — advisory orchestration, 400/502 mapping.
- `apps/backend/src/service-requests/service-requests.controller.ts` — `POST ai-triage` (200).
- `apps/backend/src/service-requests/service-requests.module.ts` — env-based provider factory.
- `apps/backend/src/service-requests/service-requests.service.ts` — persist/map priority.
- `apps/backend/test/ai-triage.eval.spec.ts` + `test/jest-eval.json` — 8 evals.
- `apps/backend/test/app.e2e-spec.ts` — 3 new e2e cases.
- `apps/backend/.env.example` — Groq key slot.
- `apps/frontend/*` — executive Hub overhaul + AI assistant widget (final step).
- `README.md` — eval + Groq setup docs.

## 7. Limits / non-goals

AI is strictly advisory: no auto-routing, no state transitions, no DB writes from
triage. Priority suggestion is a hint; `POST` still validates it. No streaming,
no chat history, no fine-tuning, no CI/CD added.
