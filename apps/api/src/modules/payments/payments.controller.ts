// ============================================================================
// FILE: /apps/api/src/modules/payments/payments.controller.ts
// ============================================================================
// Zero-trust entry points: userId comes from the request, never the body.

import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Request } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { RecordPaymentDto } from './dto/record-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  record(@Request() req: any, @Body() dto: RecordPaymentDto) {
    return this.paymentsService.record(req.user.id, dto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.paymentsService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.findOne(req.user.id, id);
  }
}
