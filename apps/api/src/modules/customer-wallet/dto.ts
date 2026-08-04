import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class UpdateWalletProfileDto {
  @ApiPropertyOptional({ example: 'Zain Ahmed' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional({ example: 'female' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  gender?: string;

  @ApiPropertyOptional({ example: '1994-03-17', description: 'ISO date; null clears it.' })
  @IsOptional()
  @IsISO8601()
  birthdate?: string | null;

  @ApiPropertyOptional({
    example: 'AE',
    description: 'ISO 3166-1 alpha-2 country code; null clears it.',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  nationality?: string | null;

  @ApiPropertyOptional({
    description: 'Stop the WhatsApp message sent after each transaction. Sign-in codes are unaffected.',
  })
  @IsOptional()
  @IsBoolean()
  txnAlertsOptOut?: boolean;
}

/**
 * The home area, confirmed by the customer.
 *
 * Null clears it. The server rejects a branch belonging to a brand they hold
 * no card for — a suggestion is not permission to claim any branch on the
 * platform.
 */
export class SetHomeBranchDto {
  @ApiPropertyOptional({ nullable: true, description: 'Branch id, or null to clear.' })
  @IsOptional()
  @IsString()
  branchId?: string | null;
}

/** The customer's own email. Null clears it. */
export class SetEmailDto {
  @ApiPropertyOptional({ nullable: true, description: 'Email address, or null to clear.' })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  email?: string | null;
}
