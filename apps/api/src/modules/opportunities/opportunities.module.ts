// ============================================================================
// FILE: /apps/api/src/modules/opportunities/opportunities.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesController } from './opportunities.controller';
import { Opportunity } from './entities/opportunity.entity';
import { OpportunityHistory } from './entities/opportunity-history.entity';
import { OpportunityScan } from './entities/opportunity-scan.entity';
import { EgressModule } from '../../egress/egress.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Opportunity, OpportunityHistory, OpportunityScan]),
    EgressModule,
    NotificationsModule,
  ],
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
