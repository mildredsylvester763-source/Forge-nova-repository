// ============================================================================
// FILE: /apps/api/src/modules/goods-tracking/goods-tracking.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockItem } from '../inventory/entities/stock-item.entity';
import { GoodsTrackingController } from './goods-tracking.controller';
import { DamagedService } from './damaged.service';
import { ConsignmentService } from './consignment.service';
import { DamagedGoodsLog } from './entities/damaged-goods-log.entity';
import { Consignor } from './entities/consignor.entity';
import { ConsignmentLot } from './entities/consignment-lot.entity';
import { ConsignmentEvent } from './entities/consignment-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([StockItem, DamagedGoodsLog, Consignor, ConsignmentLot, ConsignmentEvent]),
  ],
  controllers: [GoodsTrackingController],
  providers: [DamagedService, ConsignmentService],
})
export class GoodsTrackingModule {}
