import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type {
  ApproveServiceRequestDto as ApproveContract,
  RejectServiceRequestDto as RejectContract,
} from '@internal/shared';

export class ApproveServiceRequestDto implements ApproveContract {
  @IsOptional()
  @IsString()
  approverId?: string;

  @IsOptional()
  @IsString()
  rationale?: string;
}

export class RejectServiceRequestDto implements RejectContract {
  @IsString()
  @IsNotEmpty()
  rationale!: string;

  @IsOptional()
  @IsString()
  approverId?: string;
}
