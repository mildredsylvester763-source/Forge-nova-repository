// ============================================================================
// FILE: /apps/api/src/modules/regulatory/regulatory.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { RegulatoryService } from './regulatory.service';
import { RegulatoryController } from './regulatory.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Opportunity])],
  controllers: [RegulatoryController],
  providers: [RegulatoryService],
})
export class RegulatoryModule {}
