import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferralCode } from './entities/referral-code.entity';
import { ReferralBinding } from './entities/referral-binding.entity';
import { ReferralReward } from './entities/referral-reward.entity';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReferralCode, ReferralBinding, ReferralReward]),
    LoyaltyModule,
  ],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
