import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { TenantContext } from '@rfm-loyalty/shared';
import { CurrentTenant } from '../../auth/decorators/current-tenant.decorator';
import { CustomerJwtGuard } from '../../auth/guards/customer-jwt.guard';
import { ConversionService } from './conversion.service';
import { ConvertDto, LinkAccountDto, PreviewDto } from './dto';

/** Customer mobile app: link a partner account, preview, convert, and history. */
@ApiTags('partnerships')
@ApiBearerAuth('customer')
@Controller('customer/partners')
@UseGuards(CustomerJwtGuard)
export class CustomerPartnershipsController {
  constructor(private readonly conversions: ConversionService) {}

  @Post('link')
  @ApiOperation({ summary: 'Link the customer’s partner (e.g. Lulu) account.' })
  link(@CurrentTenant() ctx: TenantContext, @Body() dto: LinkAccountDto) {
    return this.conversions.linkAccount(ctx, dto.partnerKey, dto.memberRef);
  }

  @Post('preview')
  @ApiOperation({ summary: 'Preview a conversion (ratio, resulting partner points, eligibility).' })
  preview(@CurrentTenant() ctx: TenantContext, @Body() dto: PreviewDto) {
    return this.conversions.preview(ctx, dto.sourcePoints);
  }

  @Post('convert')
  @ApiOperation({ summary: 'Convert merchant points → partner points (atomic, idempotent).' })
  convert(@CurrentTenant() ctx: TenantContext, @Body() dto: ConvertDto) {
    return this.conversions.convert(ctx, dto.sourcePoints, dto.idempotencyKey);
  }

  @Get('conversions')
  @ApiOperation({ summary: 'The customer’s conversion history.' })
  history(@CurrentTenant() ctx: TenantContext) {
    return this.conversions.history(ctx);
  }
}
