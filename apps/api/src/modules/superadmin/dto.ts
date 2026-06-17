import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateGroupDto {
  @ApiProperty({ example: 'Roastery Holdings' })
  @IsString()
  name!: string;

  @ApiProperty({ required: false, example: 'AED' })
  @IsOptional()
  @IsString()
  defaultCurrency?: string;

  @ApiProperty({ required: false, example: 'uae' })
  @IsOptional()
  @IsString()
  homeRegion?: string;
}

export class CreateBrandDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ example: 'camel-bean' })
  @IsString()
  slug!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class CreateBranchDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  code?: string;
}

export class TopUpDto {
  @ApiProperty({ description: 'Credit amount in minor units (e.g. fils)' })
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @ApiProperty({ required: false, example: 'AED' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ description: 'Client-generated idempotency key' })
  @IsString()
  idempotencyKey!: string;
}

export class UpdateGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultCurrency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  homeRegion?: string;

  @ApiPropertyOptional({ description: 'Low-balance alert threshold (minor units)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  lowBalanceThreshold?: number;
}

export class GroupStatusDto {
  @ApiProperty({ enum: ['active', 'suspended'] })
  @IsIn(['active', 'suspended'])
  status!: 'active' | 'suspended';
}

export class EntityStatusDto {
  @ApiProperty({ enum: ['active', 'inactive', 'suspended'] })
  @IsIn(['active', 'inactive', 'suspended'])
  status!: 'active' | 'inactive' | 'suspended';
}

export class CreateTerminalDto {
  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty()
  @IsString()
  label!: string;
}

export class UpdateBrandDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'suspended', 'archived'] })
  @IsOptional()
  @IsIn(['active', 'inactive', 'suspended', 'archived'])
  status?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  branding?: Record<string, unknown>;
}

export class InviteTeamDto {
  @ApiProperty()
  @IsString()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({ example: 'platform_support' })
  @IsString()
  roleKey!: string;
}

export class TeamRoleDto {
  @ApiProperty()
  @IsString()
  roleKey!: string;
}

export class SetModulesDto {
  @ApiProperty({ type: Object, description: 'Map of moduleKey → enabled (false = hidden for the brand)' })
  @IsObject()
  access!: Record<string, boolean>;
}

export class AdminListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class CostRuleDto {
  @ApiProperty({ description: 'Drawdown cost per redeemed point (minor units)' })
  @IsInt()
  @Min(0)
  costPerPointMinor!: number;

  @ApiProperty({ required: false, description: 'Platform margin in basis points (1000 = 10%)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  platformMarginBps?: number;

  @ApiProperty({ required: false, description: 'Issuance fee per point (minor units)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  issuanceFeeMinor?: number;

  @ApiProperty({ required: false, enum: ['merchant', 'platform', 'split'] })
  @IsOptional()
  @IsEnum(['merchant', 'platform', 'split'])
  breakageOwner?: 'merchant' | 'platform' | 'split';
}
