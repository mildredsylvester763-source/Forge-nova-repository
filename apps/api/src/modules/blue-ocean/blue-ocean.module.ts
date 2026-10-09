// ============================================================================
// FILE: /apps/api/src/modules/blue-ocean/blue-ocean.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { BlueOceanService } from './blue-ocean.service';
import { BlueOceanController } from './blue-ocean.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Opportunity])],
  controllers: [BlueOceanController],
  providers: [BlueOceanService],
})
export class BlueOceanModule {}
