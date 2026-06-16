import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { GovernanceModule } from '../governance/governance.module';
import { CampaignService } from './campaign.service';
import { CustomerController } from './customer.controller';
import { GamificationService } from './gamification.service';
import { LoyaltyAppliers } from './loyalty.appliers';
import { LoyaltyService } from './loyalty.service';
import { ManageController } from './manage.controller';
import { ReferralService } from './referral.service';

/**
 * Loyalty module — the rules engine (pure decision → effects, in @rfm-loyalty/shared)
 * applied to transactions to drive the ledger, plus the brand-admin program config
 * and the customer-facing read/redeem endpoints (Phase 3). Imports GovernanceModule
 * so brand mutations run through the maker-checker interceptor and so the loyalty
 * entities are registered as governed appliers (W2).
 */
@Module({
  imports: [AuthModule, GovernanceModule],
  controllers: [CustomerController, ManageController],
  providers: [LoyaltyService, CampaignService, GamificationService, ReferralService, LoyaltyAppliers],
  exports: [LoyaltyService, CampaignService, GamificationService, ReferralService],
})
export class LoyaltyRulesModule {}
