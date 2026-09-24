import {
  Injectable,
  BadRequestException,
  UnprocessableEntityException,
  NotFoundException,
} from '@nestjs/common';
import { CreateServiceRequestDto } from './dto/create-service-request.dto';
import { UpdateServiceRequestStatusDto } from './dto/update-service-request-status.dto';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ServiceRequest as PrismaServiceRequest,
  AuditEntry as PrismaAuditEntry,
} from '@prisma/client';
import type {
  ServiceRequest as SharedServiceRequest,
  AuditEntry as SharedAuditEntry,
  ServiceRequestCategory,
  ServiceRequestPriority,
  ServiceRequestStatus,
} from '@internal/shared';
import {
  ALLOWED_TRANSITIONS,
  SERVICE_REQUEST_PRIORITIES,
  SLA_HOURS,
} from '@internal/shared';

function toContract(row: PrismaServiceRequest): SharedServiceRequest {
  const priority = (SERVICE_REQUEST_PRIORITIES as string[]).includes(
    row.priority,
  )
    ? (row.priority as ServiceRequestPriority)
    : 'Standard';
  return {
    id: row.id,
    title: row.title,
    category: row.category as ServiceRequestCategory,
    status: row.status as ServiceRequestStatus,
    priority,
    description: row.description ?? null,
    requesterId: row.requesterId ?? null,
    queueId: row.queueId ?? null,
    ownerId: row.ownerId ?? null,
    backupOwnerId: row.backupOwnerId ?? null,
    blockedReason: row.blockedReason ?? null,
    slaDueAt: row.slaDueAt ?? null,
    payloadJson: row.payloadJson ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toAuditContract(row: PrismaAuditEntry): SharedAuditEntry {
  return {
    id: row.id,
    requestId: row.requestId,
    actorId: row.actorId,
    from: (row.from as ServiceRequestStatus | null) ?? null,
    to: (row.to as ServiceRequestStatus | null) ?? null,
    action: row.action,
    createdAt: row.createdAt,
  };
}

function computeSlaDueAt(
  priority: ServiceRequestPriority,
  from: Date = new Date(),
): Date {
  const hours = SLA_HOURS[priority] ?? SLA_HOURS.Standard;
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

@Injectable()
export class ServiceRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    createDto: CreateServiceRequestDto,
    actorId = 'system',
  ): Promise<SharedServiceRequest> {
    const priority = createDto.priority ?? 'Standard';
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.serviceRequest.create({
        data: {
          title: createDto.title,
          category: createDto.category,
          status: 'Submitted',
          priority,
          description: createDto.description ?? null,
          requesterId: createDto.requesterId ?? null,
          queueId: createDto.queueId ?? null,
          ownerId: createDto.ownerId ?? null,
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

  async findAll(): Promise<SharedServiceRequest[]> {
    const rows = await this.prisma.serviceRequest.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toContract);
  }

  async findOne(id: string): Promise<SharedServiceRequest> {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException(`ServiceRequest with ID ${id} not found`);
    }
    return toContract(request);
  }

  async updateStatus(
    id: string,
    updateDto: UpdateServiceRequestStatusDto,
    actorId = 'system',
  ): Promise<SharedServiceRequest> {
    const request = await this.findOne(id);
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

  async getAuditTrail(id: string): Promise<SharedAuditEntry[]> {
    await this.findOne(id);
    const rows = await this.prisma.auditEntry.findMany({
      where: { requestId: id },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toAuditContract);
  }
}
