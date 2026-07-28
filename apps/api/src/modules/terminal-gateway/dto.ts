import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

const IDENTIFIER_TYPES = ['phone', 'email', 'qr', 'nfc', 'loyalty_id', 'card_token'] as const;

export class ResolveDto {
  @ApiProperty({ enum: IDENTIFIER_TYPES })
  @IsEnum(IDENTIFIER_TYPES)
  type!: (typeof IDENTIFIER_TYPES)[number];

  @ApiProperty()
  @IsString()
  value!: string;
}

export class MemberContextDto {
  @ApiProperty()
  @IsString()
  memberToken!: string;
}

export class EnrollDto {
  @ApiProperty({ description: 'E.164 phone (+9715xxxxxxxx)' })
  @IsString()
  phone!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fullName?: string;
}

export class CreateReceiptDto {
  @ApiProperty({ description: 'Client-generated unguessable token (uuid)' })
  @IsString()
  token!: string;

  @ApiProperty({ required: false, enum: ['sale', 'refund', 'void'] })
  @IsOptional()
  @IsString()
  kind?: string;

  @ApiProperty()
  @IsString()
  orderNo!: string;

  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) grossMinor?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) discountMinor?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) netMinor?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() currency?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() paymentMethod?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() maskedPan?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() authNo?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() memberName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) earnedPoints?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) redeemedPoints?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsInt() @Min(0) balanceAfter?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() pointsCode?: string;
}

class CartItemDto {
  @ApiProperty()
  @IsString()
  sku!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  qty!: number;
}

export class QuoteDto {
  @ApiProperty()
  @IsString()
  memberToken!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  amountMinor?: number;

  @ApiProperty({ required: false, type: [CartItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items?: CartItemDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isVisit?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  redeemPoints?: number;
}

export class TransactionDto {
  @ApiProperty({ enum: ['earn', 'redeem'] })
  @IsEnum(['earn', 'redeem'])
  intent!: 'earn' | 'redeem';

  @ApiProperty()
  @IsString()
  memberToken!: string;

  @ApiProperty({ description: 'Client/POS-generated idempotency key' })
  @IsString()
  idempotencyKey!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  amountMinor?: number;

  @ApiProperty({ required: false, type: [CartItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items?: CartItemDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isVisit?: boolean;

  @ApiProperty({ required: false, description: 'Points to redeem (intent=redeem)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  points?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sourceEvent?: string;
}

export class BatchDto {
  @ApiProperty({ type: [TransactionDto], description: 'Queued offline operations to replay' })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TransactionDto)
  operations!: TransactionDto[];
}
