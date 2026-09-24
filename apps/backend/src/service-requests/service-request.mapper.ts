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
  SERVICE_REQUEST_PRIORITIES,
  SLA_HOURS,
} from '@internal/shared';

export function toContract(row: PrismaServiceRequest): SharedServiceRequest {
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

export function toAuditContract(row: PrismaAuditEntry): SharedAuditEntry {
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

export function computeSlaDueAt(
  priority: ServiceRequestPriority,
  from: Date = new Date(),
): Date {
  const hours = SLA_HOURS[priority] ?? SLA_HOURS.Standard;
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}
