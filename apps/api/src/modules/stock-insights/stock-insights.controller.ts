// ============================================================================
// FILE: /apps/api/src/modules/stock-insights/stock-insights.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Post, Put, Query, Request } from '@nestjs/common';
import { CostingService } from './costing.service';
import { AlertsService } from './alerts.service';
import { RecordCostReceiptDto, SetSellPriceDto } from './dto/stock-insights.dto';

@Controller('stock-insights')
export class StockInsightsController {
  constructor(
    private readonly costingService: CostingService,
    private readonly alertsService: AlertsService,
  ) {}

  @Post('costs/receipts')
  async recordReceipt(@Request() req: any, @Body() dto: RecordCostReceiptDto) {
    return this.costingService.recordReceipt(req.user.id, dto);
  }

  @Put('costs/price')
  async setSellPrice(@Request() req: any, @Body() dto: SetSellPriceDto) {
    return this.costingService.setSellPrice(req.user.id, dto);
  }

  @Get('costs/margins')
  async margins(@Request() req: any) {
    return this.costingService.marginReport(req.user.id);
  }

  @Get('costs/receipts')
  async receipts(@Request() req: any, @Query('itemId') itemId?: string) {
    return this.costingService.listReceipts(req.user.id, itemId);
  }

  @Post('alerts/scan')
  async scan(@Request() req: any) {
    return this.alertsService.scan(req.user.id);
  }

  @Get('alerts')
  async alerts(@Request() req: any, @Query('status') status?: string) {
    return this.alertsService.listAlerts(req.user.id, status);
  }

  @Post('alerts/:alertId/acknowledge')
  async acknowledge(@Request() req: any, @Param('alertId') alertId: string) {
    return this.alertsService.acknowledge(req.user.id, alertId);
  }
}
