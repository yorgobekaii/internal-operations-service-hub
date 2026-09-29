import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { NotificationEvent } from '@internal/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface NotificationEventContext {
  event: NotificationEvent;
  requestId: string;
  title?: string | null;
  actorId?: string | null;
  requesterId?: string | null;
  ownerId?: string | null;
  backupOwnerId?: string | null;
  approverId?: string | null;
  from?: string | null;
  to?: string | null;
}

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

  constructor(private readonly prisma: PrismaService) {}

  async listForActor(actorId: string) {
    const [notifications, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { actorId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where: { actorId, readAt: null } }),
    ]);
    return { notifications, unreadCount };
  }

  async markRead(actorId: string, notificationId: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id: notificationId, actorId },
    });
    if (!existing) throw new NotFoundException('Notification not found');
    if (existing.readAt) return existing;
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  notify(event: string, details: Record<string, unknown>): void {
    try {
      this.logger.log(`notify ${event} ${JSON.stringify(details)}`);
    } catch {
      // Adapter failures are swallowed by design: workflow state is
      // authoritative and must survive notification outages.
    }
  }

  async fanOut(context: NotificationEventContext): Promise<void> {
    try {
      const recipients = this.recipientsFor(context);
      const message = this.messageFor(context);
      this.notify(context.event, { ...context, recipients, message });
      if (recipients.length === 0) return;

      await this.prisma.notification.createMany({
        data: recipients.map((actorId) => ({
          actorId,
          requestId: context.requestId,
          event: context.event,
          message,
        })),
      });
    } catch (error) {
      try {
        this.logger.warn(
          `notification fan-out failed for ${context.event} request ${context.requestId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } catch {
        // Logging is best effort too.
      }
    }
  }

  private recipientsFor(context: NotificationEventContext): string[] {
    const candidates: Array<string | null | undefined> = [];
    switch (context.event) {
      case 'request.created':
        candidates.push(context.ownerId, context.backupOwnerId, context.approverId);
        break;
      case 'request.status_changed':
        candidates.push(context.requesterId, context.ownerId, context.backupOwnerId);
        break;
      case 'request.approved':
      case 'request.rejected':
      case 'request.declined':
        candidates.push(context.requesterId, context.ownerId);
        break;
      case 'request.reassigned':
        candidates.push(context.to, context.ownerId, context.requesterId);
        break;
      case 'request.commented':
        candidates.push(context.requesterId, context.ownerId, context.backupOwnerId, context.approverId);
        break;
    }
    return [...new Set(
      candidates
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .map((id) => id.trim()),
    )].filter((id) => id !== context.actorId);
  }

  private messageFor(context: NotificationEventContext): string {
    const request = context.title
      ? `Request “${context.title}” (${context.requestId})`
      : `Request ${context.requestId}`;
    switch (context.event) {
      case 'request.created': return `${request} was submitted${context.to ? ` with status ${context.to}` : ''}.`;
      case 'request.status_changed': return `${request} changed from ${context.from ?? 'previous status'} to ${context.to ?? 'new status'}.`;
      case 'request.approved': return `${request} was approved and released for fulfillment.`;
      case 'request.rejected': return `${request} was rejected during approval.`;
      case 'request.declined': return `${request} was declined.`;
      case 'request.reassigned': return `${request} was reassigned to a new owner.`;
      case 'request.commented': return `${request} received a new comment.`;
    }
  }
}
