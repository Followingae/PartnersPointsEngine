import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class UpdatePartnerDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currencyName?: string;
  @ApiPropertyOptional({ enum: ['stub', 'sandbox', 'live'] }) @IsOptional() @IsIn(['stub', 'sandbox', 'live']) connectorMode?: 'stub' | 'sandbox' | 'live';
  @ApiPropertyOptional({ description: '10000 = 1 merchant pt → 1 partner pt' }) @IsOptional() @IsInt() @Min(1) defaultRatioBps?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) costPerPartnerPointMinor?: number;
  @ApiPropertyOptional({ description: 'Connector credentials (stored encrypted).' }) @IsOptional() @IsObject() connectorConfig?: Record<string, unknown>;
}

export class EnableMerchantDto {
  @ApiProperty() @IsString() brandId!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) ratioBps?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) minConversion?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) maxConversionPerDay?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) lowBalanceThresholdMinor?: number;
}

export class UpdateMerchantDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) ratioBps?: number;
  @ApiPropertyOptional({ enum: ['active', 'inactive'] }) @IsOptional() @IsIn(['active', 'inactive']) status?: 'active' | 'inactive';
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) minConversion?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) maxConversionPerDay?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}

export class FundAllowanceDto {
  @ApiProperty() @IsString() brandId!: string;
  @ApiProperty({ description: 'Minor units (e.g. fils). 10000 = AED 100.' }) @IsInt() @Min(1) amountMinor!: number;
}

export class ThresholdDto {
  @ApiProperty() @IsString() brandId!: string;
  @ApiProperty() @IsInt() @Min(0) thresholdMinor!: number;
}

export class TopupRequestDto {
  @ApiProperty({ description: 'Minor units (e.g. fils). 10000 = AED 100.' }) @IsInt() @Min(1) amountMinor!: number;
  @ApiPropertyOptional({ description: 'Optional note for the platform team.' }) @IsOptional() @IsString() note?: string;
}

export class InvoiceTopupDto {
  @ApiPropertyOptional({ description: 'Invoice reference / number.' }) @IsOptional() @IsString() invoiceRef?: string;
}

export class RejectTopupDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class LinkAccountDto {
  @ApiProperty() @IsString() partnerKey!: string;
  @ApiProperty({ description: 'Partner member reference (card / phone).' }) @IsString() memberRef!: string;
}

export class PreviewDto {
  @ApiProperty() @IsInt() @Min(1) sourcePoints!: number;
}

export class ConvertDto {
  @ApiProperty() @IsInt() @Min(1) sourcePoints!: number;
  @ApiProperty() @IsString() idempotencyKey!: string;
}
