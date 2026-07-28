/** Temporary repro: run TerminalService.memberContext against prod. Delete after use. */
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { TokenService } from './src/auth/tokens/token.service';
import { CampaignService } from './src/modules/loyalty-rules/campaign.service';
import { GamificationService } from './src/modules/loyalty-rules/gamification.service';
import { LoyaltyService } from './src/modules/loyalty-rules/loyalty.service';
import { AuditService } from './src/platform-core/audit/audit.service';
import { TenantService } from './src/platform-core/tenancy/tenant.service';
import { TerminalService } from './src/modules/terminal-gateway/terminal.service';

const fakeConfig = {
  get: (k: string) => ({ JWT_ACCESS_TTL_SECONDS: 900 })[k as never],
  getOrThrow: (k: string) =>
    ({ JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? 'x'.repeat(32), JWT_REFRESH_SECRET: 'y'.repeat(32) })[k as never],
} as never;

async function main() {
  const prisma = new PrismaClient({ datasourceUrl: process.env.PROD_DB_URL });
  await prisma.$connect();
  const brand = await prisma.brand.findFirstOrThrow({ where: { name: { contains: 'Camel' } } });
  const ctx: TenantContext = {
    platformId: brand.platformId,
    groupId: brand.groupId,
    brandId: brand.id,
    branchId: null,
    scopeLevel: 'brand',
    surface: 'terminal',
    actor: { type: 'terminal', id: 'repro-terminal', onBehalfOf: null },
  };
  const tenants = new TenantService(prisma as never);
  const audit = new AuditService();
  const tokens = new TokenService(new JwtService({}), fakeConfig);
  const crypto = { decrypt: () => '', encrypt: () => Buffer.from('') } as never;
  const loyalty = new LoyaltyService(tenants, new CampaignService(tenants, audit), new GamificationService(tenants, audit), audit, crypto);
  const terminal = new TerminalService(tenants, tokens, loyalty);

  const { memberToken } = await terminal.resolve(ctx, 'phone', '+971507925392');
  console.log('resolve ok');
  try {
    const snapshot = await terminal.memberContext(ctx, memberToken);
    console.log('context OK:', JSON.stringify(snapshot));
  } catch (e) {
    console.log('context FAILED:');
    console.log(e);
  }
  await prisma.$disconnect();
}
main();
