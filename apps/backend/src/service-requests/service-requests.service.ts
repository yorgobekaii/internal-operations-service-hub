import {
  Injectable,
  BadRequestException,
  UnprocessableEntityException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { UpdateServiceRequestStatusDto } from './dto/update-service-request-status.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import {
  ApproveServiceRequestDto,
  RejectServiceRequestDto,
} from './dto/decision.dto';
import { PrismaService } from '../prisma/prisma.service';
import { QueuesService } from '../queues/queues.service';
import {
  toContract,
  toAuditContract,
  toCommentContract,
  computeSlaDueAt,
} from './service-request.mapper';
import type {
  ServiceRequest as SharedServiceRequest,
  AuditEntry as SharedAuditEntry,
  Comment as SharedComment,
  RequestActor,
} from '@internal/shared';
import { ALLOWED_TRANSITIONS, OPERATOR_ROLES } from '@internal/shared';
import { missingPayloadFields } from '@internal/shared';

type Scope =
  | { mode: 'all' }
  | { mode: 'own'; userId: string }
  | { mode: 'dept'; userId: string; department: string };

function isOperatorRole(role?: string | null): boolean {
  return !!role && (OPERATOR_ROLES as readonly string[]).includes(role);
}

/** Parse the payloadJson bag; malformed JSON is a 400, not triage debt. */
function parsePayloadBag(raw?: string | null): Record<string, unknown> {
  if (raw === undefined || raw === null || raw.trim().length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException('payloadJson must be a valid JSON object.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new BadRequestException('payloadJson must be a valid JSON object.');
  }
  return parsed as Record<string, unknown>;
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
    // Minimalist intake rule: every category declares its mandatory
    // context fields in CATEGORY_SCHEMAS; incomplete intake is refused
    // with an explicit message instead of creating triage debt.
    const payload = parsePayloadBag(createDto.payloadJson);
    const missing = missingPayloadFields(createDto.category, payload);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Missing required fields for ${createDto.category}: ${missing.join(', ')}.`,
      );
    }
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

    // Approval invariant: gated requests cannot start fulfillment while
    // any approval step is still pending. Release happens via approve().
    if (currentStatus === 'Pending Approval' && nextStatus === 'In Progress') {
      const open = await this.openApprovalSteps(id);
      if (open.length > 0) {
        throw new UnprocessableEntityException(
          'Approval required before fulfillment can start',
        );
      }
    }

    const data: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === 'Blocked') {
      const reason = updateDto.blockedReason?.trim();
      if (!reason) {
        throw new BadRequestException(
          'A blockage reason is required to block a request.',
        );
      }
      data['blockedReason'] = reason;
    } else if (currentStatus === 'Blocked') {
      data['blockedReason'] = null;
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceRequest.update({
        where: { id },
        data: data as never,
      });
      // Entering the gate opens a pending approval step (unassigned: any
      // operator/admin may decide until Step D introduces named approvers).
      if (nextStatus === 'Pending Approval') {
        const open = await tx.approvalStep.findMany({
          where: { requestId: id, status: 'pending' },
        });
        if (open.length === 0) {
          await tx.approvalStep.create({
            data: { requestId: id, approverId: null, status: 'pending' },
          });
        }
      }
      // Aborting out of the gate closes open steps as rejected.
      if (currentStatus === 'Pending Approval' && nextStatus === 'Declined') {
        await tx.approvalStep.updateMany({
          where: { requestId: id, status: 'pending' },
          data: {
            status: 'rejected',
            approverId: updateDto.actorId ?? actorId,
            decidedAt: new Date(),
          },
        });
      }
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

  private async openApprovalSteps(requestId: string) {
    return this.prisma.approvalStep.findMany({
      where: { requestId, status: 'pending' },
    });
  }

  async approve(
    id: string,
    dto: ApproveServiceRequestDto,
    actorId = 'system',
    actor?: RequestActor,
  ): Promise<SharedServiceRequest> {
    const request = await this.findOne(id, actor);
    if (request.status !== 'Pending Approval') {
      throw new BadRequestException(
        'Only requests pending approval can be approved',
      );
    }
    const open = await this.openApprovalSteps(id);
    if (open.length === 0) {
      throw new BadRequestException(
        'No pending approval steps for this request',
      );
    }
    const approver = dto.approverId ?? actor?.userId ?? actorId;
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.approvalStep.updateMany({
        where: { requestId: id, status: 'pending' },
        data: {
          status: 'approved',
          approverId: approver,
          rationale: dto.rationale ?? null,
          decidedAt: new Date(),
        },
      });
      const updated = await tx.serviceRequest.update({
        where: { id },
        data: { status: 'In Progress' },
      });
      await tx.auditEntry.create({
        data: {
          requestId: id,
          actorId: approver,
          from: 'Pending Approval',
          to: 'In Progress',
          action: 'approved',
        },
      });
      return updated;
    });
    return toContract(row);
  }

  async reject(
    id: string,
    dto: RejectServiceRequestDto,
    actorId = 'system',
    actor?: RequestActor,
  ): Promise<SharedServiceRequest> {
    if (!dto.rationale || dto.rationale.trim().length === 0) {
      throw new BadRequestException('A rejection rationale is required.');
    }
    const request = await this.findOne(id, actor);
    if (request.status !== 'Pending Approval') {
      throw new BadRequestException(
        'Only requests pending approval can be rejected',
      );
    }
    const open = await this.openApprovalSteps(id);
    if (open.length === 0) {
      throw new BadRequestException(
        'No pending approval steps for this request',
      );
    }
    const approver = dto.approverId ?? actor?.userId ?? actorId;
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.approvalStep.updateMany({
        where: { requestId: id, status: 'pending' },
        data: {
          status: 'rejected',
          approverId: approver,
          rationale: dto.rationale.trim(),
          decidedAt: new Date(),
        },
      });
      const updated = await tx.serviceRequest.update({
        where: { id },
        data: { status: 'Declined' },
      });
      await tx.auditEntry.create({
        data: {
          requestId: id,
          actorId: approver,
          from: 'Pending Approval',
          to: 'Declined',
          action: 'rejected',
        },
      });
      return updated;
    });
    return toContract(row);
  }

  async findApprovals(
    actor?: RequestActor,
    approverId?: string,
  ): Promise<SharedServiceRequest[]> {
    const scope = await this.resolveScope(actor);
    const where: Record<string, unknown> = { status: 'Pending Approval' };
    if (scope.mode === 'own') {
      where['requesterId'] = scope.userId;
    } else if (scope.mode === 'dept') {
      where['queueId'] = { in: await this.deptQueueIds(scope.department) };
    }
    if (approverId) {
      const steps = await this.prisma.approvalStep.findMany({
        where: {
          status: 'pending',
          OR: [{ approverId }, { approverId: null }],
        },
      });
      const ids = [...new Set(steps.map((s) => s.requestId))];
      if (ids.length === 0) return [];
      where['id'] = { in: ids };
    }
    const rows = await this.prisma.serviceRequest.findMany({
      where: where as never,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toContract);
  }

  async listComments(
    id: string,
    actor?: RequestActor,
  ): Promise<SharedComment[]> {
    await this.findOne(id, actor);
    const rows = await this.prisma.comment.findMany({
      where: { requestId: id },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toCommentContract);
  }

  async addComment(
    id: string,
    dto: CreateCommentDto,
    actorId = 'system',
    actor?: RequestActor,
  ): Promise<SharedComment> {
    await this.findOne(id, actor);
    const body = dto.body?.trim();
    if (!body) {
      throw new BadRequestException('Comment body is required.');
    }
    const author = dto.authorId ?? actor?.userId ?? actorId;
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: { requestId: id, authorId: author, body },
      });
      await tx.auditEntry.create({
        data: {
          requestId: id,
          actorId: author,
          from: null,
          to: null,
          action: 'commented',
        },
      });
      return created;
    });
    return toCommentContract(row);
  }
}
