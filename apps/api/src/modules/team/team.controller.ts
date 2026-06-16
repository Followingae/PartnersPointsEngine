import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { InviteMemberDto, UpdateMemberRoleDto } from './dto';
import { TeamService } from './team.service';

/** Brand team & access management (W4). */
@ApiTags('brand-admin')
@ApiBearerAuth('admin')
@Controller('manage/team')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  @RequirePermissions('brand.manage')
  list(@CurrentTenant() ctx: TenantContext) {
    return this.team.list(ctx);
  }

  @Get('roles')
  @RequirePermissions('brand.manage')
  roles() {
    return this.team.roles();
  }

  @Post('invite')
  @RequirePermissions('brand.manage')
  @ApiOperation({ summary: 'Invite a teammate to this brand (temp password returned once for new users).' })
  invite(@CurrentTenant() ctx: TenantContext, @Body() dto: InviteMemberDto) {
    return this.team.invite(ctx, dto);
  }

  @Patch(':userId/role')
  @RequirePermissions('brand.manage')
  updateRole(@CurrentTenant() ctx: TenantContext, @Param('userId') userId: string, @Body() dto: UpdateMemberRoleDto) {
    return this.team.updateRole(ctx, userId, dto.roleKey);
  }

  @Delete(':userId')
  @RequirePermissions('brand.manage')
  @ApiOperation({ summary: 'Revoke a teammate’s access to this brand.' })
  revoke(@CurrentTenant() ctx: TenantContext, @Param('userId') userId: string) {
    return this.team.revoke(ctx, userId);
  }
}
