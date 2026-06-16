import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class BulkGenerateDto {
  @ApiProperty({ example: 'SUMMER-####', description: "Pattern ('#' → random char) or a prefix" })
  @IsString()
  pattern!: string;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(1)
  @Max(10000)
  count!: number;

  @ApiPropertyOptional({ enum: ['discount', 'percent_discount', 'bonus_points', 'free_item'] })
  @IsOptional()
  @IsIn(['discount', 'percent_discount', 'bonus_points', 'free_item'])
  kind?: string;

  @ApiPropertyOptional({ description: 'Fixed discount (minor units) or bonus points' })
  @IsOptional()
  @IsInt()
  @Min(0)
  valueMinor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  percentOff?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  perCustomerLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  campaignName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class UpdateCouponDto {
  @ApiPropertyOptional({ enum: ['active', 'paused', 'expired', 'archived'] })
  @IsOptional()
  @IsIn(['active', 'paused', 'expired', 'archived'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  perCustomerLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expiresAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  campaignName?: string;
}

export class CouponQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class RedeemCouponDto {
  @ApiProperty()
  @IsString()
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  membershipId?: string;
}
