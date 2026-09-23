import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { SERVICE_REQUEST_CATEGORIES, SERVICE_REQUEST_PRIORITIES } from '@internal/shared';
import {
  AiProviderError,
  MockLocalTriageClient,
  type AiTriageClient,
} from '../src/service-requests/ai/ai-triage.client';
import { AiTriageService } from '../src/service-requests/ai/ai-triage.service';

function serviceWith(client: AiTriageClient): AiTriageService {
  return new AiTriageService(client);
}

describe('AI triage eval suite (advisory, mock-local-v1)', () => {
  it('E1-Clear IT input suggests IT with actionable title', async () => {
    const svc = serviceWith(new MockLocalTriageClient());
    const out = await svc.suggest(
      "My laptop screen is flickering and won't turn on",
    );
    expect(out.category).toBe('IT');
    expect(out.title.length).toBeGreaterThan(3);
    expect(SERVICE_REQUEST_CATEGORIES).toContain(out.category);
    expect(SERVICE_REQUEST_PRIORITIES).toContain(out.priority);
    expect(out.confidence).toBeGreaterThanOrEqual(0.7);
    expect(out.needsHumanReview).toBe(false);
    expect(out.modelVersion).toBe('mock-local-v1');
  });

  it('E2-Clear HR input suggests HR/Standard', async () => {
    const svc = serviceWith(new MockLocalTriageClient());
    const out = await svc.suggest(
      'How do I request parental leave and check my remaining balance?',
    );
    expect(out.category).toBe('HR');
    expect(out.priority).toBe('Standard');
    expect(out.needsHumanReview).toBe(false);
  });

  it('E3-Thin input is flagged for human review (or 400 when empty)', async () => {
    const svc = serviceWith(new MockLocalTriageClient());
    const out = await svc.suggest('help');
    expect(out.needsHumanReview).toBe(true);
    await expect(svc.suggest('  ')).rejects.toThrow(BadRequestException);
  });

  it('E4-Ambiguous multi-domain input stays valid + needs review', async () => {
    const svc = serviceWith(new MockLocalTriageClient());
    const out = await svc.suggest(
      'Need access for a new hire: laptop, payroll onboarding and office badge',
    );
    expect(SERVICE_REQUEST_CATEGORIES).toContain(out.category);
    expect(out.needsHumanReview).toBe(true);
    expect(out.summary.length).toBeGreaterThan(0);
  });

  it('E5-Trusted product context: Finance high-cost suggests Finance/High', async () => {
    const svc = serviceWith(new MockLocalTriageClient());
    const out = await svc.suggest(
      'Requesting approval for a high-cost $4,500 laptop purchase for the finance team',
    );
    expect(out.category).toBe('Finance');
    expect(out.priority).toBe('High');
    expect(out.summary).toMatch(/Finance/i);
  });

  it('E6-Invalid model category is coerced to an allowed value', async () => {
    const badClient: AiTriageClient = {
      modelVersion: 'faulty-test-v1',
      suggest: async () => ({
        category: 'Flying',
        title: 'Fly me to the moon',
        priority: 'Cosmic',
        summary: 'Not a real category',
        confidence: 0.99,
      }),
    };
    const out = await serviceWith(badClient).suggest('Need a new laptop');
    expect(SERVICE_REQUEST_CATEGORIES).toContain(out.category);
    expect(SERVICE_REQUEST_PRIORITIES).toContain(out.priority);
    expect(out.category).toBe('Operations');
    expect(out.priority).toBe('Standard');
  });

  it('E7-Provider failure maps to 502 Bad Gateway (never 500 leak)', async () => {
    const failing: AiTriageClient = {
      modelVersion: 'failing-test-v1',
      suggest: async () => {
        throw new AiProviderError('upstream timeout');
      },
    };
    await expect(serviceWith(failing).suggest('Need VPN access')).rejects.toThrow(
      BadGatewayException,
    );
  });

  it('E8-Malformed confidence is defaulted and flagged for review', async () => {
    const weird: AiTriageClient = {
      modelVersion: 'weird-test-v1',
      suggest: async () => ({
        category: 'IT',
        title: 'VPN not working',
        priority: 'High',
        summary: 'IT request: VPN not working',
        confidence: NaN,
      }),
    };
    const out = await serviceWith(weird).suggest('VPN not working at all');
    expect(out.category).toBe('IT');
    expect(out.confidence).toBe(0.5);
    expect(out.needsHumanReview).toBe(true);
  });
});
