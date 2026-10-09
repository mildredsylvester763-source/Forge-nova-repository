// ============================================================================
// FILE: /apps/api/src/modules/pricing/pricing.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  controllers: [PricingController],
  providers: [PricingService],
})
export class PricingModule {}
