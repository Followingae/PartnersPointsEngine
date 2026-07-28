import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
