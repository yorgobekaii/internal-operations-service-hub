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
import { NotificationsService } from '../notifications/notifications.service';
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
  ResolvedActor,
} from '@internal/shared';
import {
  ALLOWED_TRANSITIONS,
  SENSITIVE_CATEGORIES,
  approverForCategory,
  getTeachingActor,
  isAdminRole,
  isApproverRole,
  isHandlerRole,
  isRequesterRole,
  isTeachingActorId,
  requiresAutoApproval,
  resolveTeachingActor,
} from '@internal/shared';
import { missingPayloadFields } from '@internal/shared';

type ActorInput = ResolvedActor | RequestActor | undefined;

type Scope =
  | { mode: 'own'; userId: string }
  | { mode: 'dept'; userId: string; department: string }
  | { mode: 'assigned'; userId: string }
  | { mode: 'admin'; userId: string };

function isOperatorRole(role?: string | null): boolean {
  return isHandlerRole(role) || isAdminRole(role);
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
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Single-source actor resolution (fail-closed).
   * The registry is authoritative: supplied role/department are ignored.
   * Missing or unknown `x-user-id` => Forbidden (never anonymous/global).
   */
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

  private async resolveScope(actor?: ActorInput): Promise<Scope> {
    const resolved = this.requireResolved(actor);
    if (isAdminRole(resolved.role)) return { mode: 'admin', userId: resolved.userId };
    if (isHandlerRole(resolved.role)) {
      // Handlers without a department see nothing (fail-closed, no global fallback).
      return { mode: 'dept', userId: resolved.userId, department: resolved.department ?? '' };
    }
    if (isApproverRole(resolved.role)) {
      return { mode: 'assigned', userId: resolved.userId };
    }
    // Requester (default).
    if (isRequesterRole(resolved.role) || !resolved.role) {
      return { mode: 'own', userId: resolved.userId };
    }
    throw new ForbiddenException('Forbidden: unknown role');
  }

  private async deptQueueIds(department: string): Promise<string[]> {
    if (!department) return [];
    const queues = await this.prisma.queue.findMany({
      where: { category: department },
    });
    return queues.map((q) => q.id);
  }

  private async assignedRequestIds(userId: string, onlyPending: boolean): Promise<string[]> {
    const steps = await this.prisma.approvalStep.findMany({
      where: onlyPending
        ? { approverId: userId, status: 'pending' }
        : { approverId: userId },
    });
    return [...new Set(steps.map((s) => s.requestId))];
  }

  private redactForAdmin<T extends { category: string }>(row: T, scope: Scope): T {
    if (scope.mode !== 'admin') return row;
    if (!(SENSITIVE_CATEGORIES as string[]).includes(row.category)) return row;
    return {
      ...row,
      description: '[restricted: sensitive request]',
      payloadJson: null,
    };
  }

  private async enforceScope(
    request: { id: string; requesterId: string | null; queueId: string | null },
    scope: Scope,
  ): Promise<void> {
    if (scope.mode === 'admin') return;
    if (scope.mode === 'own') {
      if (request.requesterId !== scope.userId) {
        throw new ForbiddenException('Forbidden: not your request');
      }
      return;
    }
    if (scope.mode === 'dept') {
      const allowed = await this.deptQueueIds(scope.department);
      if (!request.queueId || !allowed.includes(request.queueId)) {
        throw new ForbiddenException('Forbidden: outside your department queue');
      }
      return;
    }
    // Approver: any step ever assigned to this actor for this request.
    const steps = await this.prisma.approvalStep.findMany({
      where: { requestId: request.id, approverId: scope.userId },
    });
    if (steps.length === 0) {
      throw new ForbiddenException('Forbidden: not your approval');
    }
  }

  async create(
    createDto: CreateServiceRequestDto,
    actor?: ActorInput,
  ): Promise<SharedServiceRequest> {
    const resolved = this.requireResolved(actor);
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
    // Server-owned fields: ignore client requesterId/queueId/ownerId entirely.
    const requesterId = resolved.userId;
    const actorId = resolved.userId;
    // Slice 4 — hybrid auto-gating: high-cost Finance intake opens gated;
    // everything else keeps the Submitted default. Manual
    // Submitted → Pending Approval remains available as a fallback.
    const settings = (this.prisma as any).systemSettings
      ? await this.prisma.systemSettings.upsert({ where: { id: 'default' }, update: {}, create: {} })
      : { autoApprovalThresholdCents: 100000, urgentSlaHours: 2, highSlaHours: 24, standardSlaHours: 72, lowSlaHours: 120 };
    const autoGate = createDto.category === 'Finance' &&
      Number((payload.amount ?? 0).toString().replace(/[^0-9.]/g, '')) * 100 >= settings.autoApprovalThresholdCents;
    const initialStatus = autoGate ? 'Pending Approval' : 'Submitted';
    const designated = autoGate ? approverForCategory(createDto.category) : null;
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.serviceRequest.create({
        data: {
          title: createDto.title,
          category: createDto.category,
          status: initialStatus,
          priority,
          description: createDto.description ?? null,
          requesterId,
          queueId: route.id,
          ownerId: route.ownerId,
          backupOwnerId: route.backupOwnerId,
          payloadJson: createDto.payloadJson ?? null,
          slaDueAt: computeSlaDueAt(priority, new Date(), {
            Urgent: settings.urgentSlaHours,
            High: settings.highSlaHours,
            Standard: settings.standardSlaHours,
            Low: settings.lowSlaHours,
          }),
        },
      });
      if (autoGate && designated) {
        await tx.approvalStep.create({
          data: { requestId: created.id, approverId: designated, status: 'pending' },
        });
      }
      await tx.auditEntry.create({
        data: {
          requestId: created.id,
          actorId,
          from: null,
          to: initialStatus,
          action: 'created',
        },
      });
      return created;
    });
    this.notifications.notify(autoGate ? 'request.gated' : 'request.created', {
      requestId: row.id,
      category: createDto.category,
      priority,
      actorId,
    });
    return toContract(row);
  }

  async findAll(actor?: ActorInput): Promise<SharedServiceRequest[]> {
    const scope = await this.resolveScope(actor);
    if (scope.mode === 'dept') {
      const ids = await this.deptQueueIds(scope.department);
      if (ids.length === 0) return [];
      const rows = await this.prisma.serviceRequest.findMany({
        where: { queueId: { in: ids } },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toContract);
    }
    if (scope.mode === 'assigned') {
      const ids = await this.assignedRequestIds(scope.userId, false);
      if (ids.length === 0) return [];
      const rows = await this.prisma.serviceRequest.findMany({
        where: { id: { in: ids } },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toContract);
    }
    if (scope.mode === 'admin') {
      const rows = await this.prisma.serviceRequest.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((r) => this.redactForAdmin(toContract(r), scope));
    }
    const rows = await this.prisma.serviceRequest.findMany({
      where: { requesterId: scope.userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toContract);
  }

  async findOne(id: string, actor?: ActorInput): Promise<SharedServiceRequest> {
    const scope = await this.resolveScope(actor);
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException(`ServiceRequest with ID ${id} not found`);
    }
    await this.enforceScope(request, scope);
    return this.redactForAdmin(toContract(request), scope);
  }

  async updateStatus(
    id: string,
    updateDto: UpdateServiceRequestStatusDto,
    actor?: ActorInput,
  ): Promise<SharedServiceRequest> {
    const resolved = this.requireResolved(actor);
    // Capability boundary: only handler/admin may transition (guard + service).
    if (!isOperatorRole(resolved.role)) {
      throw new ForbiddenException('Forbidden: handler role required');
    }
    const request = await this.findOne(id, resolved);
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

    // Server-owned audit identity: ignore updateDto.actorId entirely.
    const actorId = resolved.userId;
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceRequest.update({
        where: { id },
        data: data as never,
      });
      // Entering the gate opens a pending approval step assigned to the
      // designated teaching approver for the request category.
      if (nextStatus === 'Pending Approval') {
        const designated = approverForCategory(request.category);
        const open = await tx.approvalStep.findMany({
          where: { requestId: id, status: 'pending' },
        });
        if (open.length === 0) {
          await tx.approvalStep.create({
            data: { requestId: id, approverId: designated, status: 'pending' },
          });
        } else {
          // Migrate legacy unassigned steps to the designated approver.
          const unassigned = open.filter((s) => !s.approverId);
          for (const step of unassigned) {
            await tx.approvalStep.update({
              where: { id: step.id },
              data: { approverId: designated },
            });
          }
        }
      }
      // Aborting out of the gate closes open steps as rejected.
      if (currentStatus === 'Pending Approval' && nextStatus === 'Declined') {
        await tx.approvalStep.updateMany({
          where: { requestId: id, status: 'pending' },
          data: {
            status: 'rejected',
            approverId: actorId,
            decidedAt: new Date(),
          },
        });
      }
      await tx.auditEntry.create({
        data: {
          requestId: id,
          actorId,
          from: currentStatus,
          to: nextStatus,
          action: 'status_changed',
        },
      });
      return updated;
    });
    this.notifications.notify('request.status_changed', {
      requestId: id,
      from: currentStatus,
      to: nextStatus,
      actorId,
    });
    return this.redactForAdmin(toContract(row), await this.resolveScope(resolved));
  }

  async getAuditTrail(
    id: string,
    actor?: ActorInput,
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

  /** Ensure legacy null steps are migrated to the designated approver. */
  private async designatedApproverFor(requestId: string, category: string): Promise<string> {
    const designated = approverForCategory(category);
    const open = await this.openApprovalSteps(requestId);
    const unassigned = open.filter((s) => !s.approverId);
    if (unassigned.length > 0) {
      await this.prisma.approvalStep.updateMany({
        where: { requestId, status: 'pending', approverId: null },
        data: { approverId: designated },
      });
    }
    return designated;
  }

  async approve(
    id: string,
    dto: ApproveServiceRequestDto,
    actor?: ActorInput,
  ): Promise<SharedServiceRequest> {
    const resolved = this.requireResolved(actor);
    if (!isApproverRole(resolved.role)) {
      throw new ForbiddenException('Forbidden: approver role required');
    }
    // Fetch raw (bypass approver scoping for precise 400/403 ordering).
    const raw = await this.prisma.serviceRequest.findUnique({ where: { id } });
    if (!raw) throw new NotFoundException(`ServiceRequest with ID ${id} not found`);
    if (raw.status !== 'Pending Approval') {
      throw new BadRequestException(
        'Only requests pending approval can be approved',
      );
    }
    await this.designatedApproverFor(id, raw.category);
    const open = await this.openApprovalSteps(id);
    if (open.length === 0) {
      throw new BadRequestException(
        'No pending approval steps for this request',
      );
    }
    const assignedToMe = open.some((s) => s.approverId === resolved.userId);
    if (!assignedToMe) {
      throw new ForbiddenException('Forbidden: not your approval');
    }
    // Server-owned approver identity: ignore dto.approverId.
    const approver = resolved.userId;
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
    this.notifications.notify('request.approved', { requestId: id, approver });
    return toContract(row);
  }

  async reject(
    id: string,
    dto: RejectServiceRequestDto,
    actor?: ActorInput,
  ): Promise<SharedServiceRequest> {
    const resolved = this.requireResolved(actor);
    if (!isApproverRole(resolved.role)) {
      throw new ForbiddenException('Forbidden: approver role required');
    }
    if (!dto.rationale || dto.rationale.trim().length === 0) {
      throw new BadRequestException('A rejection rationale is required.');
    }
    const raw = await this.prisma.serviceRequest.findUnique({ where: { id } });
    if (!raw) throw new NotFoundException(`ServiceRequest with ID ${id} not found`);
    if (raw.status !== 'Pending Approval') {
      throw new BadRequestException(
        'Only requests pending approval can be rejected',
      );
    }
    await this.designatedApproverFor(id, raw.category);
    const open = await this.openApprovalSteps(id);
    if (open.length === 0) {
      throw new BadRequestException(
        'No pending approval steps for this request',
      );
    }
    const assignedToMe = open.some((s) => s.approverId === resolved.userId);
    if (!assignedToMe) {
      throw new ForbiddenException('Forbidden: not your approval');
    }
    const approver = resolved.userId;
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
    this.notifications.notify('request.rejected', { requestId: id, approver });
    return toContract(row);
  }

  /**
   * Slice 2 — handler decline outside the approval gate.
   * Legal from Submitted / In Progress / Blocked (per ALLOWED_TRANSITIONS);
   * Pending Approval must go through approve()/reject() so the designated
   * approver decision + rationale stay authoritative. Terminal states 422.
   */
  async decline(
    id: string,
    dto: { rationale?: string },
    actor?: ActorInput,
  ): Promise<SharedServiceRequest> {
    const resolved = this.requireResolved(actor);
    if (!isOperatorRole(resolved.role)) {
      throw new ForbiddenException('Forbidden: handler role required');
    }
    const rationale = dto.rationale?.trim();
    if (!rationale) {
      throw new BadRequestException('A decline rationale is required.');
    }
    const request = await this.findOne(id, resolved);
    const currentStatus = request.status;
    if (currentStatus === 'Resolved' || currentStatus === 'Declined') {
      throw new UnprocessableEntityException(
        'Request is immutable and cannot be updated',
      );
    }
    if (
      currentStatus !== 'Submitted' &&
      currentStatus !== 'In Progress' &&
      currentStatus !== 'Blocked'
    ) {
      throw new BadRequestException(
        'Only Submitted, In Progress or Blocked requests can be declined here. Pending Approval requires an approver decision.',
      );
    }
    const actorId = resolved.userId;
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceRequest.update({
        where: { id },
        data: { status: 'Declined', blockedReason: null } as never,
      });
      // Close any stray open steps so the gate can never reopen silently.
      await tx.approvalStep.updateMany({
        where: { requestId: id, status: 'pending' },
        data: {
          status: 'rejected',
          approverId: actorId,
          rationale,
          decidedAt: new Date(),
        },
      });
      // Record the human-readable rationale alongside the transition.
      await tx.approvalStep.create({
        data: {
          requestId: id,
          approverId: actorId,
          status: 'rejected',
          rationale,
          decidedAt: new Date(),
        },
      });
      await tx.auditEntry.create({
        data: {
          requestId: id,
          actorId,
          from: currentStatus,
          to: 'Declined',
          action: 'status_changed',
        },
      });
      return updated;
    });
    this.notifications.notify('request.declined', {
      requestId: id,
      from: currentStatus,
      actorId,
    });
    return this.redactForAdmin(toContract(row), await this.resolveScope(resolved));
  }

  /**
   * Slice 5 — authorized reassignment within the ticket's department queue.
   * Handler/admin only; terminal states 422. The new owner must be a known
   * teaching handler serving the request's queue category (cross-department
   * or non-handler targets are 403; unknown ids are 400). Actor confinement
   * is inherited from findOne (handlers only see their own department).
   */
  async reassign(
    id: string,
    dto: { ownerId?: string },
    actor?: ActorInput,
  ): Promise<SharedServiceRequest> {
    const resolved = this.requireResolved(actor);
    if (!isOperatorRole(resolved.role)) {
      throw new ForbiddenException('Forbidden: handler role required');
    }
    const ownerId = dto.ownerId?.trim();
    if (!ownerId) {
      throw new BadRequestException('A new ownerId is required.');
    }
    if (!isTeachingActorId(ownerId)) {
      throw new BadRequestException(`Unknown owner: ${ownerId}.`);
    }
    const request = await this.findOne(id, resolved);
    if (request.status === 'Resolved' || request.status === 'Declined') {
      throw new UnprocessableEntityException(
        'Request is immutable and cannot be updated',
      );
    }
    if (!request.queueId) {
      throw new ForbiddenException('Forbidden: request has no department queue');
    }
    const queue = await this.prisma.queue.findUnique({
      where: { id: request.queueId },
    });
    if (!queue) {
      throw new ForbiddenException('Forbidden: request has no department queue');
    }
    const target = getTeachingActor(ownerId);
    if (!target || !isHandlerRole(target.role) || target.department !== queue.category) {
      throw new ForbiddenException(
        `Forbidden: ${ownerId} does not serve the ${queue.category} queue`,
      );
    }
    const actorId = resolved.userId;
    const previous = request.ownerId;
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceRequest.update({
        where: { id },
        data: { ownerId } as never,
      });
      await tx.auditEntry.create({
        data: {
          requestId: id,
          actorId,
          // Owner lineage rides the generic from/to slots (rendered as
          // `old → new` in the timeline); the action marks the kind.
          from: previous,
          to: ownerId,
          action: 'reassigned',
        },
      });
      return updated;
    });
    this.notifications.notify('request.reassigned', {
      requestId: id,
      from: previous,
      to: ownerId,
      actorId,
    });
    return this.redactForAdmin(toContract(row), await this.resolveScope(resolved));
  }

  /** Slice 2 — approval steps for rationale visibility (scoped via findOne). */
  async listApprovalSteps(id: string, actor?: ActorInput) {
    await this.findOne(id, actor);
    const rows = await this.prisma.approvalStep.findMany({
      where: { requestId: id },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      requestId: r.requestId,
      approverId: r.approverId,
      status: r.status,
      rationale: r.rationale,
      decidedAt: r.decidedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async findApprovals(actor?: ActorInput): Promise<SharedServiceRequest[]> {
    const scope = await this.resolveScope(actor);
    if (scope.mode === 'own') {
      const rows = await this.prisma.serviceRequest.findMany({
        where: { status: 'Pending Approval', requesterId: scope.userId } as never,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toContract);
    }
    if (scope.mode === 'dept') {
      const ids = await this.deptQueueIds(scope.department);
      if (ids.length === 0) return [];
      const rows = await this.prisma.serviceRequest.findMany({
        where: { status: 'Pending Approval', queueId: { in: ids } } as never,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toContract);
    }
    if (scope.mode === 'assigned') {
      const ids = await this.assignedRequestIds(scope.userId, true);
      if (ids.length === 0) return [];
      const rows = await this.prisma.serviceRequest.findMany({
        where: { status: 'Pending Approval', id: { in: ids } } as never,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toContract);
    }
    // Admin: all gated, redacted for sensitive.
    const rows = await this.prisma.serviceRequest.findMany({
      where: { status: 'Pending Approval' } as never,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.redactForAdmin(toContract(r), scope));
  }

  async listComments(
    id: string,
    actor?: ActorInput,
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
    actor?: ActorInput,
  ): Promise<SharedComment> {
    const resolved = this.requireResolved(actor);
    await this.findOne(id, resolved);
    const body = dto.body?.trim();
    if (!body) {
      throw new BadRequestException('Comment body is required.');
    }
    // Server-owned author: ignore dto.authorId.
    const author = resolved.userId;
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
    this.notifications.notify('request.commented', { requestId: id, author });
    return toCommentContract(row);
  }
}
