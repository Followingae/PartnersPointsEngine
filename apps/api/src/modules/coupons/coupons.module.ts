import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { CouponController } from './coupon.controller';
import { CouponService } from './coupon.service';

/** Coupon / promo-code engine (W4) — bulk generation, validation, redemption. */
@Module({
  imports: [AuthModule],
  controllers: [CouponController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponsModule {}
