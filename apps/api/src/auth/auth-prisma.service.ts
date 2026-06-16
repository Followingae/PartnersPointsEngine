import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@rfm-loyalty/db';

/**
 * Privileged Prisma client for the AUTH subsystem only.
 *
 * Login / token-refresh / OTP must read identity tables BEFORE a tenant context
 * exists (chicken-and-egg with RLS). This client connects as the owner role
 * (DATABASE_URL / DIRECT_URL) and is used solely by auth services for credential
 * lookups. It is a deliberate, audited trust boundary — never injected into
 * domain modules, which always use the RLS-enforced PrismaService.
 */
@Injectable()
export class AuthPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthPrismaService.name);

  constructor(config: ConfigService) {
    const url = config.get<string>('DIRECT_URL') ?? config.get<string>('DATABASE_URL');
    super({ datasourceUrl: url });
  }

  async onModuleInit(): Promise<void> {
    if (process.env.SKIP_DB === '1') return; // static OpenAPI generation / CI doc build
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
