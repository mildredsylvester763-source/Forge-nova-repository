// ============================================================================
// FILE: /apps/api/src/modules/competition/competition.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { Product } from '../products/entities/product.entity';
import { CompetitionService } from './competition.service';
import { CompetitionController } from './competition.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Opportunity, Product])],
  controllers: [CompetitionController],
  providers: [CompetitionService],
})
export class CompetitionModule {}
