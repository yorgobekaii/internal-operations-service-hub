import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import type { AiTriageSuggestion } from '@internal/shared';
import {
  AiProviderError,
  buildAdvisorySuggestion,
  createTriageClient,
  redactPii,
  type AiTriageClient,
} from './ai-triage.client';

/**
 * Advisory triage only — never writes to the DB, never changes request state.
 * Backend/product rules (allowlist validation + fallbacks) own final authority.
 */
@Injectable()
export class AiTriageService {
  constructor(private readonly client: AiTriageClient = createTriageClient()) {}

  async suggest(description: string): Promise<AiTriageSuggestion> {
    const text = (description ?? '').trim();
    if (text.length < 3) {
      throw new BadRequestException(
        'Description must be at least 3 characters.',
      );
    }
    const redacted = redactPii(text);
    let raw;
    try {
      raw = await this.client.suggest(redacted);
    } catch (err) {
      if (err instanceof AiProviderError) {
        throw new BadGatewayException(
          `AI triage provider unavailable: ${err.message}`,
        );
      }
      throw new BadGatewayException('AI triage provider unavailable');
    }
    if (!raw || typeof raw !== 'object') {
      throw new BadGatewayException('AI triage provider returned invalid output');
    }
    return buildAdvisorySuggestion(raw, this.client.modelVersion);
  }
}
