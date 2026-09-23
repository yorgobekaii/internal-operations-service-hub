import type {
  ServiceRequestStatus as SharedStatus,
  ServiceRequestCategory as SharedCategory,
  ServiceRequestPriority as SharedPriority,
} from '@internal/shared';

export type ServiceRequestStatus = SharedStatus;
export type ServiceRequestPriority = SharedPriority;

export class ServiceRequest {
  id!: string;
  title!: string;
  category!: SharedCategory;
  status!: ServiceRequestStatus;
  priority!: SharedPriority;
  createdAt!: Date;
  updatedAt!: Date;
}
