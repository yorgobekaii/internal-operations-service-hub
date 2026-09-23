import type {
  AiTriageSuggestion,
  ServiceRequestCategory,
  ServiceRequestPriority,
} from '@internal/shared';

/** Raw candidate returned by any model/provider before product validation. */
export interface RawTriageCandidate {
  category: string;
  title: string;
  priority: string;
  summary: string;
  confidence: number;
}

export interface AiTriageClient {
  readonly modelVersion: string;
  suggest(redactedDescription: string): Promise<RawTriageCandidate>;
}

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/** Minimal PII redaction before any external call (emails, long digit runs). */
export function redactPii(input: string): string {
  return input
    .replace(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      '[redacted-email]',
    )
    .replace(/\b\d{6,}\b/g, '[redacted-id]');
}

function pickCategory(text: string): {
  category: ServiceRequestCategory;
  confidence: number;
} {
  const t = text.toLowerCase();
  const has = (...words: string[]) => words.some((w) => t.includes(w));

  const it = has(
    'laptop', 'screen', 'flicker', 'keyboard', 'wifi', 'vpn', 'jira',
    'password', 'login', 'computer', 'monitor', 'printer', 'software',
    'access', 'it ',
  );
  const hr = has(
    'leave', 'payroll', 'hiring', 'onboard', 'benefit', 'vacation',
    'parental', 'hr ', 'harassment', 'contract renewal',
  );
  const fin = has(
    'expense', 'invoice', 'reimburs', 'budget', 'procurement', 'purchase',
    'finance', 'payroll approval', 'spend', 'cost',
  );
  const ops = has(
    'office', 'facilit', 'shipment', 'vendor', 'warehouse', 'operations',
    'meeting room', 'badge', 'desk',
  );

  const hits = [it, hr, fin, ops].filter(Boolean).length;
  if (hits > 1) {
    const strongFinance = ['purchase', 'expense', 'invoice', 'budget', 'procurement', 'reimburs'].some(
      (w) => t.includes(w),
    );
    if (strongFinance && fin) return { category: 'Finance', confidence: 0.78 };
    if (it) return { category: 'IT', confidence: 0.55 };
    if (fin) return { category: 'Finance', confidence: 0.55 };
    if (hr) return { category: 'HR', confidence: 0.55 };
    return { category: 'Operations', confidence: 0.55 };
  }
  if (it) return { category: 'IT', confidence: 0.92 };
  if (hr) return { category: 'HR', confidence: 0.9 };
  if (fin) return { category: 'Finance', confidence: 0.9 };
  if (ops) return { category: 'Operations', confidence: 0.88 };
  return { category: 'Operations', confidence: 0.45 };
}

function pickPriority(
  text: string,
  category: ServiceRequestCategory,
): ServiceRequestPriority {
  const t = text.toLowerCase();
  const urgent = [
    'urgent', 'asap', 'immediately', 'outage', 'down',
    "won't turn on", 'wont turn on', 'critical', 'blocked',
    'breach', 'deadline today',
  ].some((w) => t.includes(w));
  if (urgent) return 'High';
  if (
    category === 'Finance' &&
    ['approval', 'high-cost', 'high cost', '$', 'purchase'].some((w) =>
      t.includes(w),
    )
  )
    return 'High';
  if (t.split(/\s+/).filter(Boolean).length <= 2) return 'Low';
  return 'Standard';
}

function makeTitle(description: string): string {
  const single = description.replace(/\s+/g, ' ').trim();
  if (single.length <= 70) {
    return single.charAt(0).toUpperCase() + single.slice(1);
  }
  return single.slice(0, 67).trim() + '...';
}

/**
 * Deterministic local provider — default for tests/evals and offline dev.
 * No network, no API key, fully repeatable.
 */
export class MockLocalTriageClient implements AiTriageClient {
  readonly modelVersion = 'mock-local-v1';

  async suggest(redactedDescription: string): Promise<RawTriageCandidate> {
    const text = redactedDescription.trim();
    if (text.length < 3) {
      throw new AiProviderError('Description too thin for triage');
    }
    const { category, confidence } = pickCategory(text);
    return {
      category,
      title: makeTitle(text),
      priority: pickPriority(text, category),
      summary: `${category} request: ${makeTitle(text)}`,
      confidence: text.split(/\s+/).length <= 2 ? 0.35 : confidence,
    };
  }
}

const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

function buildGroqPrompt(description: string): string {
  return [
    'You are an internal IT/HR/Finance/Operations intake assistant.',
    'Return ONLY valid JSON with keys: category, title, priority, summary, confidence.',
    'category must be exactly one of: IT, HR, Finance, Operations.',
    'priority must be exactly one of: Urgent, High, Standard, Low.',
    'title: <=70 chars, no PII. summary: one sentence. confidence: 0..1 number.',
    `Employee description: """${description.slice(0, 1500)}"""`,
  ].join('\n');
}

/**
 * Real Groq provider (OpenAI-compatible chat completions).
 * Requires GROQ_API_KEY. Model via GROQ_MODEL (default llama-3.3-70b-versatile).
 * Any network/parse failure surfaces as AiProviderError -> HTTP 502 upstream.
 */
export class GroqTriageClient implements AiTriageClient {
  readonly modelVersion: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(opts?: { apiKey?: string; model?: string; timeoutMs?: number }) {
    this.apiKey = opts?.apiKey ?? process.env.GROQ_API_KEY ?? '';
    this.model =
      opts?.model ?? process.env.GROQ_MODEL ?? GROQ_DEFAULT_MODEL;
    this.timeoutMs = opts?.timeoutMs ?? 8000;
    this.modelVersion = `groq:${this.model}`;
  }

  async suggest(redactedDescription: string): Promise<RawTriageCandidate> {
    if (!this.apiKey) {
      throw new AiProviderError(
        'GROQ_API_KEY is not configured (AI_PROVIDER=groq requires it)',
      );
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          max_tokens: 400,
          messages: [
            {
              role: 'system',
              content:
                'You classify internal service requests. Respond with JSON only.',
            },
            { role: 'user', content: buildGroqPrompt(redactedDescription) },
          ],
        }),
      });
      if (!res.ok) {
        throw new AiProviderError(`Groq provider error: HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? '';
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
        throw new AiProviderError('Groq returned non-JSON output');
      }
      const parsed = JSON.parse(
        content.slice(jsonStart, jsonEnd + 1),
      ) as Partial<RawTriageCandidate>;
      return {
        category: String(parsed.category ?? ''),
        title: String(parsed.title ?? ''),
        priority: String(parsed.priority ?? ''),
        summary: String(parsed.summary ?? ''),
        confidence: Number(parsed.confidence ?? NaN),
      };
    } catch (err) {
      if (err instanceof AiProviderError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AiProviderError('Groq provider timeout');
      }
      throw new AiProviderError(
        `Groq provider failure: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Factory: AI_PROVIDER=groq selects Groq, anything else uses the mock. */
export function createTriageClient(): AiTriageClient {
  if ((process.env.AI_PROVIDER ?? 'mock').toLowerCase() === 'groq') {
    return new GroqTriageClient();
  }
  return new MockLocalTriageClient();
}

/** Validate + coerce a full suggestion (used by service and tests). */
export function buildAdvisorySuggestion(
  raw: RawTriageCandidate,
  modelVersion: string,
): AiTriageSuggestion {
  const allowedCategories = ['IT', 'HR', 'Finance', 'Operations'];
  const allowedPriorities = ['Urgent', 'High', 'Standard', 'Low'];
  const category = allowedCategories.includes(raw.category)
    ? (raw.category as ServiceRequestCategory)
    : 'Operations';
  const priority = allowedPriorities.includes(raw.priority)
    ? (raw.priority as ServiceRequestPriority)
    : 'Standard';
  const title =
    raw.title && raw.title.trim().length >= 3
      ? raw.title.trim().slice(0, 70)
      : 'General operations request';
  const summary =
    raw.summary && raw.summary.trim().length > 0
      ? raw.summary.trim().slice(0, 280)
      : `${category} request: ${title}`;
  const confidence =
    Number.isFinite(raw.confidence) && raw.confidence >= 0 && raw.confidence <= 1
      ? raw.confidence
      : 0.5;
  return {
    category,
    title,
    priority,
    summary,
    confidence,
    needsHumanReview: confidence < 0.7,
    modelVersion,
  };
}
