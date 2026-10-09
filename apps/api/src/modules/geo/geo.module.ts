// ============================================================================
// FILE: /apps/api/src/modules/geo/geo.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { GeoService } from './geo.service';
import { GeoController } from './geo.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Opportunity])],
  controllers: [GeoController],
  providers: [GeoService],
})
export class GeoModule {}
