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
  category: string;
}

export interface UpdateServiceRequestStatusDto {
  status: ServiceRequestStatus;
}

export interface ServiceRequest {
  id: string;
  title: string;
  category: string;
  status: ServiceRequestStatus;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export const USER_ROLE_HEADER = 'x-user-role';

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

export const ALLOWED_TRANSITIONS: Record<string, ServiceRequestStatus[]> = {
  Submitted: ['In Progress'],
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
} as const;
