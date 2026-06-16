import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

/** Definition shape (validated structurally in SegmentService): { match, rules:[{field,op,value}] }. */
export class CreateSegmentDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: Object, description: '{ match: all|any, rules: [{ field, op, value }] }' })
  @IsObject()
  definition!: Record<string, unknown>;
}

export class UpdateSegmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  definition?: Record<string, unknown>;
}

export class PreviewSegmentDto {
  @ApiProperty({ type: Object })
  @IsObject()
  definition!: Record<string, unknown>;
}
