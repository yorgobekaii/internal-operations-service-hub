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

export interface DeclineServiceRequestDto {
  rationale: string;
}

export interface ReassignServiceRequestDto {
  /** Teaching actor id of the new handler (must serve the ticket's queue). */
  ownerId: string;
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

/**
 * Teaching identity registry (NOT an auth system).
 *
 * The frontend simulation picker sends ONLY `x-user-id`. The backend
 * resolves role/department/approver assignment from this registry and
 * rejects absent/unknown actors with 403. Client-supplied
 * `x-user-role` / `x-user-dept` and body fields (requesterId, approverId,
 * authorId, actorId, queueId, ownerId) are never trusted.
 */
export type TeachingRole = 'requester' | 'handler' | 'approver' | 'admin';

export interface TeachingActor {
  /** Stable simulation identifier sent as `x-user-id`. */
  id: string;
  /** Friendly display name. */
  name: string;
  role: TeachingRole;
  department: string | null;
  blurb: string;
}

export const TEACHING_ACTORS: TeachingActor[] = [
  { id: 'maya.requester', name: 'Maya', role: 'requester', department: null, blurb: 'Requester' },
  { id: 'theo.requester', name: 'Theo', role: 'requester', department: null, blurb: 'Requester' },
  { id: 'omar.it-handler', name: 'Omar', role: 'handler', department: 'IT', blurb: 'IT Handler' },
  { id: 'priya.hr-handler', name: 'Priya', role: 'handler', department: 'HR', blurb: 'HR Handler' },
  { id: 'lina.finance-approver', name: 'Lina', role: 'approver', department: 'Finance', blurb: 'Finance Approver' },
  { id: 'sam.legal-approver', name: 'Sam', role: 'approver', department: 'Legal', blurb: 'Legal Approver' },
  { id: 'nora.ops-admin', name: 'Nora', role: 'admin', department: 'Operations', blurb: 'Ops Admin' },
];

const TEACHING_BY_ID = new Map<string, TeachingActor>(
  TEACHING_ACTORS.map((a) => [a.id, a]),
);

export function isTeachingActorId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return TEACHING_BY_ID.has(userId.trim());
}

export function getTeachingActor(userId: string | null | undefined): TeachingActor | undefined {
  if (!userId) return undefined;
  return TEACHING_BY_ID.get(userId.trim());
}

export interface ResolvedActor {
  userId: string;
  role: TeachingRole;
  department: string | null;
  displayName: string;
}

/** Single-source resolver: unknown/blank ids yield undefined (callers 403). */
export function resolveTeachingActor(userId: string | null | undefined): ResolvedActor | undefined {
  const found = getTeachingActor(userId);
  if (!found) return undefined;
  return {
    userId: found.id,
    role: found.role,
    department: found.department,
    displayName: `${found.name} · ${found.blurb}`,
  };
}

/** Legacy `operator` header value maps to the `handler` capability. */
export function isHandlerRole(role?: string | null): boolean {
  return role === 'handler' || role === 'operator';
}

export function isApproverRole(role?: string | null): boolean {
  return role === 'approver';
}

export function isAdminRole(role?: string | null): boolean {
  return role === 'admin';
}

export function isRequesterRole(role?: string | null): boolean {
  return role === 'requester';
}

/** HR/Legal payloads are sensitive: admin sees redacted metadata only. */
export const SENSITIVE_CATEGORIES: ServiceRequestCategory[] = ['HR', 'Legal'];

/**
 * Deterministic approver assignment for the Pending Approval gate.
 * Finance/IT/Operations -> Lina; HR/Legal -> Sam.
 */
export const APPROVER_FOR_CATEGORY: Record<ServiceRequestCategory, string> = {
  IT: 'lina.finance-approver',
  Finance: 'lina.finance-approver',
  Operations: 'lina.finance-approver',
  HR: 'sam.legal-approver',
  Legal: 'sam.legal-approver',
};

export function approverForCategory(category: string): string {
  return (
    (APPROVER_FOR_CATEGORY as Record<string, string>)[category] ??
    'lina.finance-approver'
  );
}

/** Categories an approver is designated for (reverse map, for scoped metrics). */
export function categoriesForApprover(approverId: string): ServiceRequestCategory[] {
  return (Object.keys(APPROVER_FOR_CATEGORY) as ServiceRequestCategory[]).filter(
    (c) => APPROVER_FOR_CATEGORY[c] === approverId,
  );
}

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
  declineById: (id: string) => `/service-requests/${id}/decline`,
  approvalsById: (id: string) => `/service-requests/${id}/approvals`,
  assignById: (id: string) => `/service-requests/${id}/assign`,
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

/**
 * Slice 4 — deterministic auto-gating threshold (hybrid model).
 * Finance requests at or above this amount enter `Pending Approval` on
 * creation with a step for the designated approver. The manual
 * `Submitted → Pending Approval` handler transition remains available
 * as a fallback for judgment calls below the threshold.
 */
export const AUTO_APPROVAL_THRESHOLD_AMOUNT = 1000;

/** Parse a free-text Finance amount (`4500 USD`, `$4,500`) to a number. */
export function parseAmount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return 0;
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** True when creation must open directly in `Pending Approval`. */
export function requiresAutoApproval(
  category: string,
  payload: Record<string, unknown>,
): boolean {
  if (category !== 'Finance') return false;
  return parseAmount(payload['amount']) >= AUTO_APPROVAL_THRESHOLD_AMOUNT;
}

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
