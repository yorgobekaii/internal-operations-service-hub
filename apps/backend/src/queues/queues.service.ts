import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toContract } from '../service-requests/service-request.mapper';
import {
  SERVICE_REQUEST_CATEGORIES,
  SERVICE_REQUEST_PRIORITIES,
  SERVICE_REQUEST_STATUSES,
  type Queue as SharedQueue,
  type ServiceRequest as SharedServiceRequest,
  type ServiceRequestCategory,
} from '@internal/shared';

const ACTIVE_STATUSES = ['Submitted', 'Pending Approval', 'In Progress', 'Blocked'];

export interface QueueWithCounts extends SharedQueue {
  openCount: number;
  totalCount: number;
}

export interface QueueRequestsQuery {
  status?: string;
  priority?: string;
  page?: number;
  limit?: number;
}

export interface QueueRequestsPage {
  data: SharedServiceRequest[];
  page: number;
  limit: number;
  total: number;
}

function seedEmail(category: string, kind: 'owner' | 'backup'): string {
  return `${category.toLowerCase()}.${kind}@internal.local`;
}

@Injectable()
export class QueuesService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureSeedUser(
    email: string,
    department: string,
  ): Promise<{ id: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) return existing;
    return this.prisma.user.create({
      data: { email, role: 'operator', department },
    });
  }

  /**
   * Idempotent routing target for a category. Creates the queue plus
   * seeded owner/backup handler users on first use (SQLite-safe upserts
   * by unique keys, so concurrent calls cannot duplicate rows).
   */
  async routeForCategory(category: string) {
    let queue = await this.prisma.queue.findUnique({ where: { category } });
    if (!queue) {
      const owner = await this.ensureSeedUser(seedEmail(category, 'owner'), category);
      const backup = await this.ensureSeedUser(seedEmail(category, 'backup'), category);
      queue = await this.prisma.queue.create({
        data: {
          name: `${category} Queue`,
          category,
          ownerId: owner.id,
          backupOwnerId: backup.id,
        },
      });
      return queue;
    }
    if (!queue.ownerId || !queue.backupOwnerId) {
      const owner = await this.ensureSeedUser(seedEmail(category, 'owner'), category);
      const backup = await this.ensureSeedUser(seedEmail(category, 'backup'), category);
      queue = await this.prisma.queue.update({
        where: { id: queue.id },
        data: {
          ownerId: queue.ownerId ?? owner.id,
          backupOwnerId: queue.backupOwnerId ?? backup.id,
        },
      });
    }
    return queue;
  }

  async ensureDefaultQueues(): Promise<void> {
    for (const category of SERVICE_REQUEST_CATEGORIES) {
      await this.routeForCategory(category);
    }
  }

  async listQueues(): Promise<QueueWithCounts[]> {
    await this.ensureDefaultQueues();
    const queues = await this.prisma.queue.findMany({
      orderBy: { category: 'asc' },
    });
    return Promise.all(
      queues.map(async (q) => {
        const [openCount, totalCount] = await Promise.all([
          this.prisma.serviceRequest.count({
            where: { queueId: q.id, status: { in: ACTIVE_STATUSES } },
          }),
          this.prisma.serviceRequest.count({ where: { queueId: q.id } }),
        ]);
        return {
          id: q.id,
          name: q.name,
          category: q.category as ServiceRequestCategory,
          createdAt: q.createdAt,
          updatedAt: q.updatedAt,
          openCount,
          totalCount,
        };
      }),
    );
  }

  async findByQueue(
    queueId: string,
    query: QueueRequestsQuery,
  ): Promise<QueueRequestsPage> {
    const queue = await this.prisma.queue.findUnique({ where: { id: queueId } });
    if (!queue) {
      throw new NotFoundException(`Queue with ID ${queueId} not found`);
    }
    const where: Record<string, unknown> = { queueId };
    if (query.status !== undefined) {
      if (!(SERVICE_REQUEST_STATUSES as string[]).includes(query.status)) {
        throw new BadRequestException('Invalid status filter.');
      }
      where['status'] = query.status;
    }
    if (query.priority !== undefined) {
      if (!(SERVICE_REQUEST_PRIORITIES as string[]).includes(query.priority)) {
        throw new BadRequestException('Invalid priority filter.');
      }
      where['priority'] = query.priority;
    }
    const page =
      query.page !== undefined && Number.isFinite(query.page)
        ? Math.max(1, Math.floor(query.page))
        : 1;
    const limit =
      query.limit !== undefined && Number.isFinite(query.limit)
        ? Math.min(100, Math.max(1, Math.floor(query.limit)))
        : 20;
    const [total, rows] = await Promise.all([
      this.prisma.serviceRequest.count({ where: where as never }),
      this.prisma.serviceRequest.findMany({
        where: where as never,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data: rows.map(toContract), page, limit, total };
  }
}
