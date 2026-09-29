import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateUserDto {
  @IsString() id!: string;
  @IsString() name!: string;
  @IsEmail() email!: string;
  @IsString() role!: string;
  @IsOptional() @IsString() departmentId?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class DeactivateUserDto {
  @IsOptional() @IsString() replacementUserId?: string;
}

export class CreateDepartmentDto {
  @IsString() name!: string;
}

export class UpdateDepartmentDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateMappingDto {
  @IsString() departmentId!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateSettingsDto {
  @IsOptional() @Min(0) autoApprovalThresholdAmount?: number;
  @IsOptional() @IsInt() @Min(1) urgentSlaHours?: number;
  @IsOptional() @IsInt() @Min(1) highSlaHours?: number;
  @IsOptional() @IsInt() @Min(1) standardSlaHours?: number;
  @IsOptional() @IsInt() @Min(1) lowSlaHours?: number;
}
