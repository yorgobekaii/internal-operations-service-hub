import { Injectable, Logger } from '@nestjs/common';

/**
 * Log-only notification adapter (Step F).
 *
 * Notifications are a secondary delivery mechanism: they inform humans but
 * never own workflow state. This stub proves the decoupling contract — a
 * real email/chat provider can replace the body later without touching
 * callers, and delivery failure must never fail a transition.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  notify(event: string, details: Record<string, unknown>): void {
    try {
      this.logger.log(`notify ${event} ${JSON.stringify(details)}`);
    } catch {
      // Adapter failures are swallowed by design: workflow state is
      // authoritative and must survive notification outages.
    }
  }
}
