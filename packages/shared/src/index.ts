export type ServiceRequestStatus =
  | 'Submitted'
  | 'Pending Approval'
  | 'In Progress'
  | 'Blocked'
  | 'Resolved'
  | 'Declined';

export type ServiceRequestCategory =
  | 'IT'
  | 'HR'
  | 'Finance'
  | 'Operations'
  | 'Legal';

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

export type AuditAction =
  | 'created'
  | 'status_changed'
  | 'approved'
  | 'rejected'
  | 'commented';

export interface AuditEntry {
  id: string;
  requestId: string;
  actorId: string;
  from: ServiceRequestStatus | null;
  to: ServiceRequestStatus | null;
  action: AuditAction | string;
  createdAt: string | Date;
}

export interface Comment {
  id: string;
  requestId: string;
  authorId: string;
  body: string;
  createdAt: string | Date;
}

export interface CreateCommentDto {
  body: string;
  authorId?: string;
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
  'Legal',
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
  approveById: (id: string) => `/service-requests/${id}/approve`,
  rejectById: (id: string) => `/service-requests/${id}/reject`,
  commentsById: (id: string) => `/service-requests/${id}/comments`,
  aiTriage: '/service-requests/ai-triage',
} as const;

export const APPROVALS_ROUTE = '/approvals';

export const METRICS_ROUTE = '/metrics/queue-health';

export interface QueueHealth {
  queueId: string | null;
  category: string;
  name: string;
  open: number;
  breached: number;
  avgAgeHours: number | null;
}

export interface QueueHealthReport {
  generatedAt: string | Date;
  volume: { total: number; last24h: number };
  /** Open requests across Submitted / Pending Approval / In Progress / Blocked. */
  backlog: number;
  /** Open requests past their slaDueAt. */
  breachedOpen: number;
  breachedOpenIds: string[];
  /** Resolved requests completed after their slaDueAt. */
  resolvedLate: number;
  avgQueueAgeHours: number | null;
  avgCycleHours: number | null;
  perQueue: QueueHealth[];
}

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
  Urgent: 2,
  High: 24,
  Standard: 72,
  Low: 120,
};

export type CategoryFieldType = 'text' | 'textarea' | 'select';

export interface CategoryField {
  name: string;
  label: string;
  type: CategoryFieldType;
  required: boolean;
  /** Where the value lands: top-level description or the payloadJson bag. */
  mapTo?: 'description' | 'payload';
  options?: string[];
  placeholder?: string;
}

/**
 * Minimalist per-category intake: the smallest field set that lets the
 * router triage without follow-up questions. `description` fields land on
 * the request; everything else lands in payloadJson.
 */
export const CATEGORY_SCHEMAS: Record<ServiceRequestCategory, CategoryField[]> = {
  IT: [
    { name: 'system', label: 'System / asset', type: 'text', required: true, placeholder: 'e.g. Jira, laptop SN-204' },
    { name: 'details', label: 'What exactly is wrong?', type: 'textarea', required: false, mapTo: 'description', placeholder: 'Symptoms, error messages, urgency…' },
  ],
  HR: [
    { name: 'topic', label: 'Topic', type: 'select', required: true, options: ['Leave', 'Benefits', 'Conduct', 'Hiring', 'Other'] },
    { name: 'details', label: 'Details', type: 'textarea', required: false, mapTo: 'description', placeholder: 'Dates, people involved (no sensitive IDs)…' },
  ],
  Finance: [
    { name: 'amount', label: 'Amount', type: 'text', required: true, placeholder: 'e.g. 4500 USD' },
    { name: 'costCenter', label: 'Cost center', type: 'text', required: true, placeholder: 'e.g. CC-042' },
    { name: 'details', label: 'Justification', type: 'textarea', required: false, mapTo: 'description', placeholder: 'What is this spend for?' },
  ],
  Operations: [
    { name: 'location', label: 'Location', type: 'text', required: true, placeholder: 'e.g. HQ floor 3' },
    { name: 'details', label: 'Details', type: 'textarea', required: false, mapTo: 'description', placeholder: 'What do you need?' },
  ],
  Legal: [
    { name: 'reviewType', label: 'Review type', type: 'select', required: true, options: ['Contract', 'Vendor', 'Policy', 'Other'] },
    { name: 'deadline', label: 'Deadline', type: 'text', required: false, placeholder: 'e.g. 2026-10-15' },
    { name: 'details', label: 'Background', type: 'textarea', required: false, mapTo: 'description', placeholder: 'Parties, context, links…' },
  ],
};

/** Required payloadJson keys for a category (description-mapped fields excluded). */
export function requiredPayloadFields(category: ServiceRequestCategory): string[] {
  return (CATEGORY_SCHEMAS[category] ?? [])
    .filter((f) => f.required && (f.mapTo ?? 'payload') === 'payload')
    .map((f) => f.name);
}

/** Names of required fields that are missing or blank in a parsed payload bag. */
export function missingPayloadFields(
  category: ServiceRequestCategory,
  payload: Record<string, unknown>,
): string[] {
  return requiredPayloadFields(category).filter((name) => {
    const v = payload[name];
    return typeof v !== 'string' || v.trim().length === 0;
  });
}
