export type ServiceRequestStatus =
  | 'Submitted'
  | 'Pending Approval'
  | 'In Progress'
  | 'Blocked'
  | 'Resolved'
  | 'Declined';

export type ServiceRequestCategory = 'IT' | 'HR' | 'Finance' | 'Operations';

export interface CreateServiceRequestDto {
  title: string;
  category: ServiceRequestCategory;
  priority?: ServiceRequestPriority;
  description?: string;
  requesterId?: string;
  queueId?: string;
  ownerId?: string;
  payloadJson?: string;
}

export interface UpdateServiceRequestStatusDto {
  status: ServiceRequestStatus;
  blockedReason?: string;
  actorId?: string;
}

export interface ApproveServiceRequestDto {
  approverId?: string;
  rationale?: string;
}

export interface RejectServiceRequestDto {
  rationale: string;
  approverId?: string;
}

export interface ServiceRequest {
  id: string;
  title: string;
  category: ServiceRequestCategory;
  status: ServiceRequestStatus;
  priority: ServiceRequestPriority;
  description?: string | null;
  requesterId?: string | null;
  queueId?: string | null;
  ownerId?: string | null;
  backupOwnerId?: string | null;
  blockedReason?: string | null;
  slaDueAt?: string | Date | null;
  payloadJson?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface User {
  id: string;
  email: string;
  role: string;
  department?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface Queue {
  id: string;
  name: string;
  category: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export type ApprovalStepStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalStep {
  id: string;
  requestId: string;
  approverId: string | null;
  status: ApprovalStepStatus;
  rationale: string | null;
  decidedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export type AuditAction = 'created' | 'status_changed' | 'approved' | 'rejected';

export interface AuditEntry {
  id: string;
  requestId: string;
  actorId: string;
  from: ServiceRequestStatus | null;
  to: ServiceRequestStatus | null;
  action: AuditAction | string;
  createdAt: string | Date;
}

export type ServiceRequestPriority = 'Urgent' | 'High' | 'Standard' | 'Low';

export const USER_ROLE_HEADER = 'x-user-role';
export const USER_ID_HEADER = 'x-user-id';

export const OPERATOR_ROLES = ['operator', 'admin'] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

export const SERVICE_REQUEST_CATEGORIES: ServiceRequestCategory[] = [
  'IT',
  'HR',
  'Finance',
  'Operations',
];

export const SERVICE_REQUEST_STATUSES: ServiceRequestStatus[] = [
  'Submitted',
  'Pending Approval',
  'In Progress',
  'Blocked',
  'Resolved',
  'Declined',
];

export const SERVICE_REQUEST_PRIORITIES: ServiceRequestPriority[] = [
  'Urgent',
  'High',
  'Standard',
  'Low',
];

export interface AiTriageRequest {
  description: string;
}

export interface AiTriageSuggestion {
  category: ServiceRequestCategory;
  title: string;
  priority: ServiceRequestPriority;
  summary: string;
  confidence: number;
  needsHumanReview: boolean;
  modelVersion: string;
}

export const ALLOWED_TRANSITIONS: Record<
  ServiceRequestStatus,
  ServiceRequestStatus[]
> = {
  // Reconciled with docs/product-spec.md + docs/data-model.md transition matrix:
  // Submitted may route to approval gating, auto-start, or decline on validation failure.
  Submitted: ['In Progress', 'Pending Approval', 'Declined'],
  'In Progress': ['Resolved', 'Blocked', 'Declined'],
  Blocked: ['In Progress', 'Declined'],
  'Pending Approval': ['In Progress', 'Declined'],
  Resolved: [],
  Declined: [],
};

export const SERVICE_REQUEST_ROUTES = {
  base: '/service-requests',
  byId: (id: string) => `/service-requests/${id}`,
  statusById: (id: string) => `/service-requests/${id}/status`,
  auditById: (id: string) => `/service-requests/${id}/audit`,
  aiTriage: '/service-requests/ai-triage',
} as const;

export const QUEUE_ROUTES = {
  base: '/queues',
  byId: (id: string) => `/queues/${id}`,
  requestsByQueue: (id: string) => `/queues/${id}/requests`,
} as const;

export const USER_DEPT_HEADER = 'x-user-dept';

export interface RequestActor {
  userId?: string;
  role?: string;
  department?: string;
}

export const SLA_HOURS: Record<ServiceRequestPriority, number> = {
  Urgent: 4,
  High: 24,
  Standard: 72,
  Low: 120,
};

export const REOPEN_DAYS = 7;
