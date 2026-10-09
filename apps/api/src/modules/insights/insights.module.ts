// ============================================================================
// FILE: /apps/api/src/modules/insights/insights.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { InsightsService } from './insights.service';
import { InsightsController } from './insights.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Opportunity])],
  controllers: [InsightsController],
  providers: [InsightsService],
})
export class InsightsModule {}
