import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { RequirePermissions } from '../../auth/authz/permissions.decorator';
import { PermissionsGuard } from '../../auth/authz/permissions.guard';
import { AdminJwtGuard } from '../../auth/guards/admin-jwt.guard';
import { CreateSegmentDto, PreviewSegmentDto, UpdateSegmentDto } from './dto';
import { SegmentService, type SegmentDefinition } from './segment.service';

/** Brand-admin audience / segment builder. */
@ApiTags('brand-admin')
@ApiBearerAuth('admin')
@Controller('manage/segments')
@UseGuards(AdminJwtGuard, PermissionsGuard)
export class SegmentController {
  constructor(private readonly segments: SegmentService) {}

  @Post('preview')
  @RequirePermissions('brand.report.read')
  @ApiOperation({ summary: 'Live member count + sample for a definition (no save).' })
  preview(@CurrentTenant() ctx: TenantContext, @Body() dto: PreviewSegmentDto) {
    return this.segments.preview(ctx, dto.definition as SegmentDefinition);
  }

  @Get()
  @RequirePermissions('brand.report.read')
  list(@CurrentTenant() ctx: TenantContext) {
    return this.segments.list(ctx);
  }

  @Get(':id')
  @RequirePermissions('brand.report.read')
  get(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.segments.get(ctx, id);
  }

  @Get(':id/members')
  @RequirePermissions('brand.customer.read')
  members(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.segments.members(ctx, id);
  }

  @Post()
  @RequirePermissions('brand.campaign.write')
  create(@CurrentTenant() ctx: TenantContext, @Body() dto: CreateSegmentDto) {
    return this.segments.create(ctx, { name: dto.name, description: dto.description, definition: dto.definition as SegmentDefinition });
  }

  @Patch(':id')
  @RequirePermissions('brand.campaign.write')
  update(@CurrentTenant() ctx: TenantContext, @Param('id') id: string, @Body() dto: UpdateSegmentDto) {
    return this.segments.update(ctx, id, { name: dto.name, description: dto.description, definition: dto.definition as SegmentDefinition | undefined });
  }

  @Delete(':id')
  @RequirePermissions('brand.campaign.write')
  remove(@CurrentTenant() ctx: TenantContext, @Param('id') id: string) {
    return this.segments.remove(ctx, id);
  }
}
