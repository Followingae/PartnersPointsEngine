import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { AdminPartnershipsController } from './admin-partnerships.controller';
import { BrandPartnershipsController } from './brand-partnerships.controller';
import { ConversionService } from './conversion.service';
import { CustomerPartnershipsController } from './customer-partnerships.controller';
import { StubLuluConnector } from './partner-connector';
import { PartnershipService } from './partnership.service';

/** Partnerships (open-loop): convert merchant points → a partner currency
    (Lulu Happiness Points) on a prepaid allowance. Connector is stubbed until the
    live Lulu API is available. */
@Module({
  imports: [AuthModule], // EnvelopeCryptoService for connector creds
  controllers: [AdminPartnershipsController, BrandPartnershipsController, CustomerPartnershipsController],
  providers: [PartnershipService, ConversionService, StubLuluConnector],
})
export class PartnershipsModule {}
