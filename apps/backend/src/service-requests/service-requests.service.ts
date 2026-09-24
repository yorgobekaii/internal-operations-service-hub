import {
  Injectable,
  BadRequestException,
  UnprocessableEntityException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { UpdateServiceRequestStatusDto } from './dto/update-service-request-status.dto';
import { PrismaService } from '../prisma/prisma.service';
import { QueuesService } from '../queues/queues.service';
import {
  toContract,
  toAuditContract,
  computeSlaDueAt,
} from './service-request.mapper';
import type {
  ServiceRequest as SharedServiceRequest,
  AuditEntry as SharedAuditEntry,
  RequestActor,
} from '@internal/shared';
import { ALLOWED_TRANSITIONS, OPERATOR_ROLES } from '@internal/shared';

type Scope =
  | { mode: 'all' }
  | { mode: 'own'; userId: string }
  | { mode: 'dept'; userId: string; department: string };

function isOperatorRole(role?: string | null): boolean {
  return !!role && (OPERATOR_ROLES as readonly string[]).includes(role);
}

@Injectable()
export class ServiceRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueuesService,
  ) {}

  /**
   * Dev-stub identity: header-trust model (same as AuthGuard). First sight
   * of an x-user-id provisions a User row so row-level scoping has
   * something to key on. Existing rows are never overwritten here.
   */
  private async ensureUser(actor?: RequestActor) {
    if (!actor?.userId) return null;
    const existing = await this.prisma.user.findUnique({
      where: { email: actor.userId },
    });
    if (existing) return existing;
    return this.prisma.user.create({
      data: {
        email: actor.userId,
        role: actor.role ?? 'requester',
        department: actor.department ?? null,
      },
    });
  }

  private async resolveScope(actor?: RequestActor): Promise<Scope> {
    if (!actor?.userId) return { mode: 'all' };
    if (actor.role === 'admin') return { mode: 'all' };
    const user = await this.ensureUser(actor);
    const role = user?.role ?? actor.role ?? 'requester';
    if (role === 'admin') return { mode: 'all' };
    if (isOperatorRole(role)) {
      const department = user?.department ?? actor.department;
      if (!department) return { mode: 'all' };
      return { mode: 'dept', userId: actor.userId, department };
    }
    return { mode: 'own', userId: actor.userId };
  }

  private async deptQueueIds(department: string): Promise<string[]> {
    const queues = await this.prisma.queue.findMany({
      where: { category: department },
    });
    return queues.map((q) => q.id);
  }

  private buildWhere(scope: Scope): Record<string, unknown> {
    if (scope.mode === 'own') return { requesterId: scope.userId };
    return {};
  }

  private async enforceScope(
    request: { id: string; requesterId: string | null; queueId: string | null },
    scope: Scope,
  ): Promise<void> {
    if (scope.mode === 'all') return;
    if (scope.mode === 'own') {
      if (request.requesterId !== scope.userId) {
        throw new ForbiddenException('Forbidden: not your request');
      }
      return;
    }
    const allowed = await this.deptQueueIds(scope.department);
    if (!request.queueId || !allowed.includes(request.queueId)) {
      throw new ForbiddenException('Forbidden: outside your department queue');
    }
  }

  async create(
    createDto: CreateServiceRequestDto,
    actorId = 'system',
    actor?: RequestActor,
  ): Promise<SharedServiceRequest> {
    const priority = createDto.priority ?? 'Standard';
    const route = await this.queues.routeForCategory(createDto.category);
    const requesterId = createDto.requesterId ?? actor?.userId ?? null;
    if (actor?.userId) await this.ensureUser(actor);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.serviceRequest.create({
        data: {
          title: createDto.title,
          category: createDto.category,
          status: 'Submitted',
          priority,
          description: createDto.description ?? null,
          requesterId,
          queueId: createDto.queueId ?? route.id,
          ownerId: createDto.ownerId ?? route.ownerId,
          backupOwnerId: route.backupOwnerId,
          payloadJson: createDto.payloadJson ?? null,
          slaDueAt: computeSlaDueAt(priority),
        },
      });
      await tx.auditEntry.create({
        data: {
          requestId: created.id,
          actorId,
          from: null,
          to: 'Submitted',
          action: 'created',
        },
      });
      return created;
    });
    return toContract(row);
  }

  async findAll(actor?: RequestActor): Promise<SharedServiceRequest[]> {
    const scope = await this.resolveScope(actor);
    if (scope.mode === 'dept') {
      const ids = await this.deptQueueIds(scope.department);
      const rows = await this.prisma.serviceRequest.findMany({
        where: { queueId: { in: ids } },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toContract);
    }
    const rows = await this.prisma.serviceRequest.findMany({
      where: this.buildWhere(scope) as never,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toContract);
  }

  async findOne(id: string, actor?: RequestActor): Promise<SharedServiceRequest> {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException(`ServiceRequest with ID ${id} not found`);
    }
    const scope = await this.resolveScope(actor);
    await this.enforceScope(request, scope);
    return toContract(request);
  }

  async updateStatus(
    id: string,
    updateDto: UpdateServiceRequestStatusDto,
    actorId = 'system',
    actor?: RequestActor,
  ): Promise<SharedServiceRequest> {
    const request = await this.findOne(id, actor);
    const currentStatus = request.status;
    const nextStatus = updateDto.status;

    if (!nextStatus) {
      throw new BadRequestException('Status is required.');
    }

    if (currentStatus === 'Resolved' || currentStatus === 'Declined') {
      throw new UnprocessableEntityException(
        'Request is immutable and cannot be updated',
      );
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus];
    if (!allowed) {
      throw new BadRequestException('Unknown state transition');
    }
    if (!allowed.includes(nextStatus)) {
      throw new BadRequestException('Invalid state transition.');
    }

    const data: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === 'Blocked') {
      data['blockedReason'] = updateDto.blockedReason ?? null;
    } else if (currentStatus === 'Blocked') {
      data['blockedReason'] = null;
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceRequest.update({
        where: { id },
        data: data as never,
      });
      await tx.auditEntry.create({
        data: {
          requestId: id,
          actorId: updateDto.actorId ?? actorId,
          from: currentStatus,
          to: nextStatus,
          action: 'status_changed',
        },
      });
      return updated;
    });
    return toContract(row);
  }

  async getAuditTrail(
    id: string,
    actor?: RequestActor,
  ): Promise<SharedAuditEntry[]> {
    await this.findOne(id, actor);
    const rows = await this.prisma.auditEntry.findMany({
      where: { requestId: id },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toAuditContract);
  }
}
