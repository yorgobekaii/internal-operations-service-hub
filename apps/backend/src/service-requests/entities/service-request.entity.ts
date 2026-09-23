import type {
  ServiceRequestStatus as SharedStatus,
  ServiceRequestCategory as SharedCategory,
} from '@internal/shared';

export type ServiceRequestStatus = SharedStatus;

export class ServiceRequest {
  id!: string;
  title!: string;
  category!: SharedCategory;
  status!: ServiceRequestStatus;
  createdAt!: Date;
  updatedAt!: Date;
}
