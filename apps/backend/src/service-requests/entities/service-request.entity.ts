import type { ServiceRequestStatus as SharedStatus } from '@internal/shared';

export type ServiceRequestStatus = SharedStatus;

export class ServiceRequest {
  id: string;
  title: string;
  category: string;
  status: ServiceRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

