import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toContract } from '../service-requests/service-request.mapper';
import {
  SERVICE_REQUEST_CATEGORIES,
  SERVICE_REQUEST_PRIORITIES,
  SERVICE_REQUEST_STATUSES,
  SENSITIVE_CATEGORIES,
  isAdminRole,
  isHandlerRole,
  resolveTeachingActor,
  type Queue as SharedQueue,
  type RequestActor,
  type ResolvedActor,
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
  data: ReturnType<typeof toContract>[];
  page: number;
  limit: number;
  total: number;
}

function seedEmail(category: string, kind: 'owner' | 'backup'): string {
  return `${category.toLowerCase()}.${kind}@internal.local`;
}

type ActorInput = ResolvedActor | RequestActor | undefined;

@Injectable()
export class QueuesService {
  constructor(private readonly prisma: PrismaService) {}

  private requireResolved(actor?: ActorInput): ResolvedActor {
    if (actor && 'role' in actor && 'displayName' in actor && actor.userId) {
      return actor as ResolvedActor;
    }
    const userId = (actor as { userId?: string } | undefined)?.userId;
    const resolved = resolveTeachingActor(
      typeof userId === 'string' ? userId : undefined,
    );
    if (!resolved) {
      throw new ForbiddenException('Forbidden: unknown or missing actor');
    }
    return resolved;
  }

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
    const mapping = await this.prisma.departmentCategoryMapping.findUnique({
      where: { category },
      include: { department: true },
    });
    if (mapping && (!mapping.active || !mapping.department.active)) {
      throw new BadRequestException(`Category ${category} is not currently routable.`);
    }
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

  async listQueues(actor?: ActorInput): Promise<QueueWithCounts[]> {
    const resolved = this.requireResolved(actor);
    // Requesters and approvers have no queue-workbench scope.
    if (!isAdminRole(resolved.role) && !isHandlerRole(resolved.role)) {
      throw new ForbiddenException('Forbidden: handler or admin required');
    }
    await this.ensureDefaultQueues();
    const queues = await this.prisma.queue.findMany({
      orderBy: { category: 'asc' },
    });
    const visible =
      isAdminRole(resolved.role)
        ? queues
        : queues.filter((q) => q.category === resolved.department);
    return Promise.all(
      visible.map(async (q) => {
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
    actor?: ActorInput,
  ): Promise<QueueRequestsPage> {
    const resolved = this.requireResolved(actor);
    if (!isAdminRole(resolved.role) && !isHandlerRole(resolved.role)) {
      throw new ForbiddenException('Forbidden: handler or admin required');
    }
    const queue = await this.prisma.queue.findUnique({ where: { id: queueId } });
    if (!queue) {
      throw new NotFoundException(`Queue with ID ${queueId} not found`);
    }
    if (isHandlerRole(resolved.role) && queue.category !== resolved.department) {
      throw new ForbiddenException('Forbidden: outside your department queue');
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
    const data = rows.map(toContract).map((r) => {
      if (
        isAdminRole(resolved.role) &&
        (SENSITIVE_CATEGORIES as string[]).includes(r.category)
      ) {
        return { ...r, description: '[restricted: sensitive request]', payloadJson: null };
      }
      return r;
    });
    return { data, page, limit, total };
  }
}
