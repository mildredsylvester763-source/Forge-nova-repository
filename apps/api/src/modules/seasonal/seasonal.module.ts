// ============================================================================
// FILE: /apps/api/src/modules/seasonal/seasonal.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { SeasonalService } from './seasonal.service';
import { SeasonalController } from './seasonal.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Opportunity])],
  controllers: [SeasonalController],
  providers: [SeasonalService],
})
export class SeasonalModule {}
