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
