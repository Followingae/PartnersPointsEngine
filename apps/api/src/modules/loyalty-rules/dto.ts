import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class RedeemDto {
  @ApiProperty({ description: 'Client-generated idempotency key' })
  @IsString()
  idempotencyKey!: string;
}

export class CreateEarnRuleDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ description: '{ condition?, actions[] } per the rules engine', type: Object })
  @IsObject()
  definition!: Record<string, unknown>;
}

export class CreateCatalogItemDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Points cost (whole integer)', example: 500 })
  @IsInt()
  @Min(1)
  pointsCost!: number;

  @ApiProperty({ required: false, default: 'voucher' })
  @IsOptional()
  @IsString()
  kind?: string;
}

export class CreateTierDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ description: 'Lifetime points to reach this tier' })
  @IsInt()
  @Min(0)
  threshold!: number;

  @ApiProperty({ required: false, default: 10000, description: 'Earn multiplier in bps (10000 = 1.0x)' })
  @IsOptional()
  @IsInt()
  multiplierBps?: number;
}

export class CreateCampaignDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  startsAt?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  endsAt?: string;

  @ApiProperty({ description: '{ condition?, actions[] }', type: Object })
  @IsObject()
  definition!: Record<string, unknown>;
}

export class CreateBadgeDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  rewardPoints?: number;
}

export class CreateChallengeDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional({ enum: ['lifetime_points', 'visits', 'spend'], default: 'lifetime_points' })
  @IsOptional()
  @IsIn(['lifetime_points', 'visits', 'spend'])
  kind?: string;

  @ApiProperty({ description: 'Target (lifetime points / visits / spend depending on kind)' })
  @IsInt()
  @Min(1)
  target!: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  rewardPoints?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  badgeId?: string;
}

export class RedeemReferralDto {
  @ApiProperty()
  @IsString()
  code!: string;
}

export class ListQueryDto {
  @ApiPropertyOptional({ description: 'Free-text search' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Status filter (entity-specific)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';

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

export class UpdateEarnRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;
}

export class UpdateCatalogItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  pointsCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  kind?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'archived'] })
  @IsOptional()
  @IsIn(['active', 'inactive', 'archived'])
  status?: string;
}

export class UpdateTierDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  threshold?: number;

  @ApiPropertyOptional({ description: 'Earn multiplier in bps (10000 = 1.0x)' })
  @IsOptional()
  @IsInt()
  multiplierBps?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  benefits?: Record<string, unknown>;
}

export class UpdateCampaignDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startsAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endsAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;
}

export class UpdateBadgeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  rewardPoints?: number;
}

export class UpdateChallengeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ['lifetime_points', 'visits', 'spend'] })
  @IsOptional()
  @IsIn(['lifetime_points', 'visits', 'spend'])
  kind?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  target?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  rewardPoints?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  badgeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({ description: 'Brand display name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Points unit label (e.g. PTS, Beans)' })
  @IsOptional()
  @IsString()
  pointsCurrencyCode?: string;

  @ApiPropertyOptional({ description: 'Money currency (ISO-4217)' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ type: Object, description: 'White-label theming (logoUrl, primaryColor, …)' })
  @IsOptional()
  @IsObject()
  branding?: Record<string, unknown>;
}

export class UpdateCustomerProfileDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({ required: false, description: 'e.g. male / female / other / undisclosed' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiProperty({ required: false, description: 'ISO date (YYYY-MM-DD); empty string clears it' })
  @IsOptional()
  @IsString()
  birthdate?: string | null;
}

export class AdminEarnDto {
  @ApiProperty()
  @IsString()
  membershipId!: string;

  @ApiProperty({ required: false, description: 'Spend in minor units' })
  @IsOptional()
  @IsInt()
  @Min(0)
  amountMinor?: number;

  @ApiProperty({ required: false, enum: ['online', 'in_store'] })
  @IsOptional()
  @IsString()
  channel?: 'online' | 'in_store';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isVisit?: boolean;

  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @IsArray()
  items?: Array<{ sku: string; qty: number }>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sourceEvent?: string;

  @ApiProperty()
  @IsString()
  idempotencyKey!: string;
}
