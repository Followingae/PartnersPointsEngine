import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { CreateTemplateDto, PreviewTemplateDto, UpdateTemplateDto } from './dto';
import { MessagingService } from './messaging.service';

/** Brand-admin messaging templates (W4). Sending providers wired in a later wave. */
@ApiTags('brand-admin')
@ApiBearerAuth('admin')
@Controller('manage/templates')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Get('variables')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Available template variables + sample values.' })
  variables() {
    return this.messaging.variables();
  }

  @Post('preview')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Render a template with sample data.' })
  preview(@Body() dto: PreviewTemplateDto) {
    return this.messaging.preview(dto.subject, dto.body);
  }

  @Get()
  @RequirePermissions('brand.report.read')
  list(@CurrentTenant() ctx: TenantContext, @Query('channel') channel?: string, @Query('q') q?: string) {
    return this.messaging.list(ctx, { channel, q });
  }

  @Get(':id')
  @RequirePermissions('brand.report.read')
  get(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.messaging.get(ctx, id);
  }

  @Post()
  @RequirePermissions('brand.campaign.write')
  create(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateTemplateDto) {
    return this.messaging.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermissions('brand.campaign.write')
  update(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.messaging.update(ctx, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('brand.campaign.write')
  remove(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.messaging.remove(ctx, id);
  }
}
