import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { validateEnv } from './config/env';
import { AuthModule } from './auth/auth.module';
import { PlatformCoreModule } from './platform-core/platform-core.module';
import { currentTenant } from './platform-core/tenancy/tenant-context';
import { LedgerModule } from './modules/ledger/ledger.module';
import { LoyaltyRulesModule } from './modules/loyalty-rules/loyalty-rules.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { IdentityModule } from './modules/identity/identity.module';
import { TerminalGatewayModule } from './modules/terminal-gateway/terminal-gateway.module';
import { WorkersModule } from './modules/workers/workers.module';
import { SuperadminModule } from './modules/superadmin/superadmin.module';
import { GovernanceModule } from './modules/governance/governance.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { SegmentsModule } from './modules/segments/segments.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { TeamModule } from './modules/team/team.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { PartnershipsModule } from './modules/partnerships/partnerships.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['../../.env', '.env'],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req: IncomingMessage, res: ServerResponse) => {
          const incoming = req.headers['x-request-id'];
          const id = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
          res.setHeader('X-Request-Id', id);
          return id;
        },
        redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]'],
        customProps: () => {
          const t = currentTenant();
          return t ? { surface: t.surface, groupId: t.groupId, brandId: t.brandId } : {};
        },
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
      },
    }),
    PlatformCoreModule,
    AuthModule,
    // Domain modules (clean boundaries; bodies filled in later phases)
    LedgerModule,
    LoyaltyRulesModule,
    CampaignsModule,
    GamificationModule,
    WalletModule,
    ReportingModule,
    IdentityModule,
    TerminalGatewayModule,
    WorkersModule,
    SuperadminModule,
    GovernanceModule,
    CouponsModule,
    SegmentsModule,
    MessagingModule,
    WebhooksModule,
    TeamModule,
    ApiKeysModule,
    PartnershipsModule,
  ],
})
export class AppModule {}
