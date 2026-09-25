import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  QueueHealth,
  QueueHealthReport,
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

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getQueueHealth(now: Date = new Date()): Promise<QueueHealthReport> {
    const [requests, queues] = await Promise.all([
      this.prisma.serviceRequest.findMany(),
      this.prisma.queue.findMany({ orderBy: { category: 'asc' } }),
    ]);
    const rows = requests as MetricRow[];
    const open = rows.filter((r) => ACTIVE_STATUSES.includes(r.status));
    const resolved = rows.filter((r) => r.status === 'Resolved');

    const breached = open.filter((r) => r.slaDueAt && r.slaDueAt < now);
    const resolvedLate = resolved.filter(
      (r) => r.slaDueAt && r.updatedAt > r.slaDueAt,
    );

    const queueMeta = new Map(
      queues.map((q) => [q.id, { category: q.category, name: q.name }]),
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
      breachedOpen: breached.length,
      breachedOpenIds: breached.slice(0, 100).map((r) => r.id),
      resolvedLate: resolvedLate.length,
      avgQueueAgeHours: mean(
        open.map((r) => (now.getTime() - r.createdAt.getTime()) / HOUR_MS),
      ),
      avgCycleHours: mean(
        resolved.map((r) => (r.updatedAt.getTime() - r.createdAt.getTime()) / HOUR_MS),
      ),
      perQueue,
    };
  }
}
