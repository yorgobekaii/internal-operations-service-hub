import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  QueueHealth,
  QueueHealthReport,
  RequestActor,
  ResolvedActor,
} from '@internal/shared';
import {
  categoriesForApprover,
  isAdminRole,
  isApproverRole,
  isHandlerRole,
  isRequesterRole,
  resolveTeachingActor,
} from '@internal/shared';

const ACTIVE_STATUSES = ['Submitted', 'Pending Approval', 'In Progress', 'Blocked'];

interface MetricRow {
  id: string;
  status: string;
  queueId: string | null;
  slaDueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const HOUR_MS = 60 * 60 * 1000;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

type ActorInput = ResolvedActor | RequestActor | undefined;

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  private requirePrivileged(actor?: ActorInput): ResolvedActor {
    if (actor && 'role' in actor && 'displayName' in actor && actor.userId) {
      const resolved = actor as ResolvedActor;
      if (isRequesterRole(resolved.role)) {
        throw new ForbiddenException('Forbidden: handler, approver or admin required');
      }
      return resolved;
    }
    const userId = (actor as { userId?: string } | undefined)?.userId;
    const resolved = resolveTeachingActor(
      typeof userId === 'string' ? userId : undefined,
    );
    if (!resolved) {
      throw new ForbiddenException('Forbidden: unknown or missing actor');
    }
    // Requesters have no operational-metrics scope.
    if (isRequesterRole(resolved.role)) {
      throw new ForbiddenException('Forbidden: handler, approver or admin required');
    }
    if (
      !isAdminRole(resolved.role) &&
      !isHandlerRole(resolved.role) &&
      !isApproverRole(resolved.role)
    ) {
      throw new ForbiddenException('Forbidden: handler, approver or admin required');
    }
    return resolved;
  }

  async getQueueHealth(actor?: ActorInput, now: Date = new Date(), asOfInput?: string): Promise<QueueHealthReport> {
    const resolved = this.requirePrivileged(actor);
    const nowForReport = asOfInput ? new Date(`${asOfInput}T23:59:59.999Z`) : now;
    if (Number.isNaN(nowForReport.getTime())) {
      throw new ForbiddenException('Invalid metrics date.');
    }
    const [requests, queues] = await Promise.all([
      this.prisma.serviceRequest.findMany(),
      this.prisma.queue.findMany({ orderBy: { category: 'asc' } }),
    ]);
    const queueMeta = new Map(
      queues.map((q) => [q.id, { category: q.category, name: q.name }]),
    );

    // Scope aggregate rows: admin sees all; handler sees own department;
    // approver sees only categories they are designated for.
    let allowedCategories: Set<string> | null = null;
    if (isHandlerRole(resolved.role)) {
      allowedCategories = new Set(resolved.department ? [resolved.department] : []);
    } else if (isApproverRole(resolved.role)) {
      allowedCategories = new Set(categoriesForApprover(resolved.userId));
    }

    const inScope = (r: { queueId: string | null }): boolean => {
      if (!allowedCategories) return true;
      if (!r.queueId) return false;
      const meta = queueMeta.get(r.queueId);
      if (!meta) return false;
      return allowedCategories.has(meta.category);
    };

    const rows = (requests as MetricRow[]).filter((r) => inScope(r) && r.createdAt <= nowForReport);
    const open = rows.filter((r) => ACTIVE_STATUSES.includes(r.status));
    const resolvedRows = rows.filter((r) => r.status === 'Resolved');
    // Slice 6 — Declined is terminal and never reopened (immutability rule);
    // reported as a cumulative closed count, not a reopen rate.
    const declined = rows.filter((r) => r.status === 'Declined').length;

    const breached = open.filter((r) => r.slaDueAt && r.slaDueAt < nowForReport);
    const resolvedLate = resolvedRows.filter(
      (r) => r.slaDueAt && r.updatedAt > r.slaDueAt,
    );

    const byQueue = new Map<string | null, MetricRow[]>();
    for (const r of open) {
      const list = byQueue.get(r.queueId) ?? [];
      list.push(r);
      byQueue.set(r.queueId, list);
    }
    const perQueue: QueueHealth[] = [...byQueue.entries()].map(
      ([queueId, list]) => {
        const meta = queueId
          ? (queueMeta.get(queueId) ?? { category: '—', name: 'Unrouted' })
          : { category: '—', name: 'Unrouted' };
        return {
          queueId,
          category: meta.category,
          name: meta.name,
          open: list.length,
          breached: list.filter((r) => r.slaDueAt && r.slaDueAt < now).length,
          avgAgeHours: mean(
            list.map((r) => (nowForReport.getTime() - r.createdAt.getTime()) / HOUR_MS),
          ),
        };
      },
    );
    perQueue.sort((a, b) => a.category.localeCompare(b.category));

    return {
      generatedAt: nowForReport,
      volume: {
        total: rows.length,
        last24h: rows.filter(
          (r) => nowForReport.getTime() - r.createdAt.getTime() <= 24 * HOUR_MS,
        ).length,
      },
      backlog: open.length,
      declined,
      breachedOpen: breached.length,
      breachedOpenIds: breached.slice(0, 100).map((r) => r.id),
      resolvedLate: resolvedLate.length,
      avgQueueAgeHours: mean(
        open.map((r) => (nowForReport.getTime() - r.createdAt.getTime()) / HOUR_MS),
      ),
      avgCycleHours: mean(
        resolvedRows.map((r) => (r.updatedAt.getTime() - r.createdAt.getTime()) / HOUR_MS),
      ),
      perQueue,
    };
  }

}
