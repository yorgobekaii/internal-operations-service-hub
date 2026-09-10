export type ServiceRequestStatus = 'Submitted' | 'In Progress' | 'Resolved';

export class ServiceRequest {
  id: string;
  title: string;
  category: string;
  status: ServiceRequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

