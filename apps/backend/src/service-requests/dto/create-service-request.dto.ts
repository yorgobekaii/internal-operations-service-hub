import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import {
  SERVICE_REQUEST_CATEGORIES,
  SERVICE_REQUEST_PRIORITIES,
  type CreateServiceRequestDto as CreateServiceRequestContract,
  type ServiceRequestCategory,
  type ServiceRequestPriority,
} from '@internal/shared';

export class CreateServiceRequestDto implements CreateServiceRequestContract {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(SERVICE_REQUEST_CATEGORIES)
  category!: ServiceRequestCategory;

  @IsOptional()
  @IsString()
  @IsIn(SERVICE_REQUEST_PRIORITIES)
  priority?: ServiceRequestPriority;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  requesterId?: string;

  @IsOptional()
  @IsString()
  queueId?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  payloadJson?: string;
}
