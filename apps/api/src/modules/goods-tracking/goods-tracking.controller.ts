// ============================================================================
// FILE: /apps/api/src/modules/goods-tracking/goods-tracking.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Post, Query, Request } from '@nestjs/common';
import { DamagedService } from './damaged.service';
import { ConsignmentService } from './consignment.service';
import {
  ConsignmentReturnDto,
  ConsignmentSaleDto,
  CreateConsignorDto,
  ReceiveConsignmentDto,
  RecordDamageDto,
} from './dto/goods-tracking.dto';

@Controller('goods-tracking')
export class GoodsTrackingController {
  constructor(
    private readonly damagedService: DamagedService,
    private readonly consignmentService: ConsignmentService,
  ) {}

  @Post('damage')
  async recordDamage(@Request() req: any, @Body() dto: RecordDamageDto) {
    return this.damagedService.recordDamage(req.user.id, dto);
  }

  @Get('damage')
  async listDamage(@Request() req: any, @Query('sku') sku?: string) {
    return this.damagedService.listDamage(req.user.id, sku);
  }

  @Post('consignors')
  async createConsignor(@Request() req: any, @Body() dto: CreateConsignorDto) {
    return this.consignmentService.createConsignor(req.user.id, dto);
  }

  @Get('consignors')
  async listConsignors(@Request() req: any) {
    return this.consignmentService.listConsignors(req.user.id);
  }

  @Post('consignments/receive')
  async receiveConsignment(@Request() req: any, @Body() dto: ReceiveConsignmentDto) {
    return this.consignmentService.receiveConsignment(req.user.id, dto);
  }

  @Post('consignments/sale')
  async recordSale(@Request() req: any, @Body() dto: ConsignmentSaleDto) {
    return this.consignmentService.recordSale(req.user.id, dto);
  }

  @Post('consignments/return')
  async returnConsignment(@Request() req: any, @Body() dto: ConsignmentReturnDto) {
    return this.consignmentService.returnConsignment(req.user.id, dto);
  }

  @Get('consignments/summary/:consignorId')
  async summary(@Request() req: any, @Param('consignorId') consignorId: string) {
    return this.consignmentService.summary(req.user.id, consignorId);
  }
}
