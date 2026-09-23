import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import {
  SERVICE_REQUEST_CATEGORIES,
  type CreateServiceRequestDto as CreateServiceRequestContract,
  type ServiceRequestCategory,
} from '@internal/shared';

export class CreateServiceRequestDto implements CreateServiceRequestContract {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(SERVICE_REQUEST_CATEGORIES)
  category!: ServiceRequestCategory;
}
