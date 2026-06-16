import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length, Matches } from 'class-validator';

export class OtpRequestDto {
  @ApiProperty({ example: '+971500000001' })
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phone must be E.164' })
  phone!: string;

  @ApiProperty({ description: 'The brand the customer is signing into (closed-loop).' })
  @IsUUID()
  brandId!: string;
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
