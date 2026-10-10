import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class MfaVerifyDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

export class ConfirmMfaDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class EnrolMfaDto {
  @ApiProperty({ format: 'password', description: 'Current password — re-authentication for a sensitive change.' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(8)
  currentPassword!: string;

  @ApiProperty({ format: 'password', description: 'At least 12 characters.' })
  @IsString()
  @MinLength(12)
  newPassword!: string;
}
