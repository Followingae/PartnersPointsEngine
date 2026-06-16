import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class SubmitChangeRequestDto {
  @ApiProperty({ example: 'reward' })
  @IsString()
  entityType!: string;

  @ApiProperty({ enum: ['create', 'update', 'delete'] })
  @IsIn(['create', 'update', 'delete'])
  action!: 'create' | 'update' | 'delete';

  @ApiPropertyOptional({ description: 'Target id for update/delete' })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ChangeRequestQueryDto {
  @ApiPropertyOptional({ enum: ['pending', 'approved', 'rejected', 'withdrawn'] })
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'withdrawn'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brandId?: string;

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

export class RejectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  decisionReason?: string;
}

export class BulkDecisionDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  decisionReason?: string;
}

class GovernanceOverrideDto {
  @ApiProperty()
  @IsString()
  entityType!: string;

  @ApiProperty({ enum: ['autonomous', 'approval_required', 'superadmin_managed', 'inherit'] })
  @IsIn(['autonomous', 'approval_required', 'superadmin_managed', 'inherit'])
  mode!: 'autonomous' | 'approval_required' | 'superadmin_managed' | 'inherit';
}

export class SetGovernanceDto {
  @ApiPropertyOptional({ enum: ['autonomous', 'approval_required', 'superadmin_managed'] })
  @IsOptional()
  @IsIn(['autonomous', 'approval_required', 'superadmin_managed'])
  defaultMode?: 'autonomous' | 'approval_required' | 'superadmin_managed';

  @ApiPropertyOptional({ type: [GovernanceOverrideDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GovernanceOverrideDto)
  overrides?: GovernanceOverrideDto[];
}
