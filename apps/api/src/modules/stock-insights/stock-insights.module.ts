// ============================================================================
// FILE: /apps/api/src/modules/stock-insights/stock-insights.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StockItem } from '../inventory/entities/stock-item.entity';
import { StockInsightsController } from './stock-insights.controller';
import { CostingService } from './costing.service';
import { AlertsService } from './alerts.service';
import { ItemCost } from './entities/item-cost.entity';
import { CostReceipt } from './entities/cost-receipt.entity';
import { LowStockAlert } from './entities/low-stock-alert.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StockItem, ItemCost, CostReceipt, LowStockAlert])],
  controllers: [StockInsightsController],
  providers: [CostingService, AlertsService],
})
export class StockInsightsModule {}
