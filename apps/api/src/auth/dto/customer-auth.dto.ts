import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class OtpRequestDto {
  @ApiProperty({ example: '+971500000001' })
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone must be E.164' })
  phone!: string;

  @ApiProperty({
    required: false,
    description:
      'Only for the legacy per-brand sign-in. The customer app signs in to the ' +
      'wallet, which spans brands, and sends no brandId.',
  })
  @IsOptional()
  @IsUUID()
  brandId?: string;
}

/** Wallet sign-in: the app has no brand yet — the cards are what reveal them. */
export class WalletOtpVerifyDto {
  @ApiProperty({ example: '+971500000001' })
  @Matches(/^\+[1-9]\d{6,14}$/)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class OtpVerifyDto {
  @ApiProperty({ example: '+971500000001' })
  @Matches(/^\+[1-9]\d{6,14}$/)
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code!: string;

  @ApiProperty()
  @IsUUID()
  brandId!: string;
}
