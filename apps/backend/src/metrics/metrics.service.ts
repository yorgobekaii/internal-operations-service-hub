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

  async getQueueHealth(actor?: ActorInput, now: Date = new Date()): Promise<QueueHealthReport> {
    const resolved = this.requirePrivileged(actor);
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

    const rows = (requests as MetricRow[]).filter(inScope);
    const open = rows.filter((r) => ACTIVE_STATUSES.includes(r.status));
    const resolvedRows = rows.filter((r) => r.status === 'Resolved');
    // Slice 6 — Declined is terminal and never reopened (immutability rule);
    // reported as a cumulative closed count, not a reopen rate.
    const declined = rows.filter((r) => r.status === 'Declined').length;

    const breached = open.filter((r) => r.slaDueAt && r.slaDueAt < now);
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
            list.map((r) => (now.getTime() - r.createdAt.getTime()) / HOUR_MS),
          ),
        };
      },
    );
    perQueue.sort((a, b) => a.category.localeCompare(b.category));

    return {
      generatedAt: now,
      volume: {
        total: rows.length,
        last24h: rows.filter(
          (r) => now.getTime() - r.createdAt.getTime() <= 24 * HOUR_MS,
        ).length,
      },
      backlog: open.length,
      declined,
      breachedOpen: breached.length,
      breachedOpenIds: breached.slice(0, 100).map((r) => r.id),
      resolvedLate: resolvedLate.length,
      avgQueueAgeHours: mean(
        open.map((r) => (now.getTime() - r.createdAt.getTime()) / HOUR_MS),
      ),
      avgCycleHours: mean(
        resolvedRows.map((r) => (r.updatedAt.getTime() - r.createdAt.getTime()) / HOUR_MS),
      ),
      perQueue,
    };
  }

  async getCalendar(actor: ActorInput | undefined, fromInput?: string, toInput?: string) {
    const resolved = this.requirePrivileged(actor);
    if (!isAdminRole(resolved.role)) throw new ForbiddenException('Forbidden: admin role required');
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
    const from = fromInput ? new Date(`${fromInput}T00:00:00.000Z`) : defaultFrom;
    const to = toInput ? new Date(`${toInput}T23:59:59.999Z`) : now;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new ForbiddenException('Invalid calendar date range.');
    const [requests, audits] = await Promise.all([this.prisma.serviceRequest.findMany(), this.prisma.auditEntry.findMany({ where: { createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'asc' } })]);
    const requestMap = new Map(requests.map((request) => [request.id, request]));
    const days: Array<{ date: string; created: number; resolved: number; declined: number; breached: number; cycleValues: number[] }> = [];
    for (let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const date = cursor.toISOString().slice(0, 10);
      days.push({ date, created: 0, resolved: 0, declined: 0, breached: 0, cycleValues: [] });
    }
    const byDate = new Map(days.map((day) => [day.date, day]));
    for (const request of requests) {
      const day = byDate.get(request.createdAt.toISOString().slice(0, 10));
      if (day) day.created += 1;
      const dueDay = request.slaDueAt?.toISOString().slice(0, 10);
      if (dueDay && request.slaDueAt && request.slaDueAt < now && request.status !== 'Resolved' && request.status !== 'Declined') {
        const due = byDate.get(dueDay); if (due) due.breached += 1;
      }
    }
    for (const audit of audits) {
      const day = byDate.get(audit.createdAt.toISOString().slice(0, 10));
      if (!day) continue;
      const request = requestMap.get(audit.requestId);
      if (audit.to === 'Resolved') { day.resolved += 1; if (request) day.cycleValues.push((audit.createdAt.getTime() - request.createdAt.getTime()) / HOUR_MS); }
      if (audit.to === 'Declined' || audit.action === 'rejected') day.declined += 1;
    }
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), days: days.map((day) => ({ date: day.date, created: day.created, resolved: day.resolved, declined: day.declined, breached: day.breached, averageCycleHours: mean(day.cycleValues) })) };
  }
}
