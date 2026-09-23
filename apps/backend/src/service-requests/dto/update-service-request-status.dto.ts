import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import {
  SERVICE_REQUEST_STATUSES,
  type UpdateServiceRequestStatusDto as UpdateStatusContract,
  type ServiceRequestStatus,
} from '@internal/shared';

export class UpdateServiceRequestStatusDto implements UpdateStatusContract {
  @IsString()
  @IsNotEmpty()
  @IsIn(SERVICE_REQUEST_STATUSES)
  status!: ServiceRequestStatus;
}
