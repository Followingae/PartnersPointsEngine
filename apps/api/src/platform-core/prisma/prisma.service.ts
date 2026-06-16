import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@rfm-loyalty/db';

/**
 * Prisma client for the API. Connects as APP_DATABASE_URL (the dedicated,
 * non-owner, RLS-enforced `loyalty_app` role) when set; falls back to
 * DATABASE_URL for local dev. Tenant context is applied per request by
 * {@link TenantService}, never here.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const url = config.get<string>('APP_DATABASE_URL') ?? config.get<string>('DATABASE_URL');
    super({ datasourceUrl: url });
  }

  async onModuleInit(): Promise<void> {
    if (process.env.SKIP_DB === '1') return; // static OpenAPI generation / CI doc build
    await this.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
