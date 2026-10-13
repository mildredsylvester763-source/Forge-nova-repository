// ============================================================================
// FILE: /apps/api/src/modules/receipts/receipts.controller.ts
// ============================================================================

import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Request } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';

@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Post('payment/:paymentId')
  @HttpCode(HttpStatus.OK)
  issue(@Request() req: any, @Param('paymentId', ParseUUIDPipe) paymentId: string) {
    return this.receiptsService.issueForPayment(req.user.id, paymentId);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.receiptsService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.receiptsService.findOne(req.user.id, id);
  }
}
