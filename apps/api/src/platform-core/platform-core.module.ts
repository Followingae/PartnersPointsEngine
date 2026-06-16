import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditService } from './audit/audit.service';
import { HealthController } from './health/health.controller';
import { PrismaService } from './prisma/prisma.service';
import { TenantService } from './tenancy/tenant.service';
import { TenantAlsInterceptor } from './tenancy/tenant-als.interceptor';

/**
 * Cross-cutting infrastructure shared by every domain module: the Prisma client,
 * the transaction-scoped tenant-context runner, the tenant ALS interceptor, and
 * the health endpoints. Global so domain modules can inject these without re-importing.
 */
@Global()
@Module({
  controllers: [HealthController],
  providers: [
    PrismaService,
    TenantService,
    AuditService,
    { provide: APP_INTERCEPTOR, useClass: TenantAlsInterceptor },
  ],
  exports: [PrismaService, TenantService, AuditService],
})
export class PlatformCoreModule {}
