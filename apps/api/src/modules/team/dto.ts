import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty()
  @IsString()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiProperty({ example: 'brand_admin' })
  @IsString()
  roleKey!: string;
}

export class UpdateMemberRoleDto {
  @ApiProperty({ example: 'analyst_readonly' })
  @IsString()
  roleKey!: string;
}
