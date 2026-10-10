// ============================================================================
// FILE: /apps/api/src/modules/payment-links/payment-links.controller.ts
// ============================================================================
// Management routes are owner-scoped. The token routes are the customer
// face: resolve (what do I owe?) and pay (record the payment). Static
// segments before :id.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
} from '@nestjs/common';
import { PaymentLinksService } from './payment-links.service';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';

@Controller('payment-links')
export class PaymentLinksController {
  constructor(private readonly paymentLinksService: PaymentLinksService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreatePaymentLinkDto) {
    return this.paymentLinksService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.paymentLinksService.findAll(req.user.id);
  }

  @Get('token/:token')
  resolve(@Param('token') token: string) {
    return this.paymentLinksService.resolveByToken(token);
  }

  @Post('token/:token/pay')
  @HttpCode(HttpStatus.OK)
  pay(@Param('token') token: string, @Body() body: { amountCents?: number }) {
    return this.paymentLinksService.consumeByToken(token, body?.amountCents);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.paymentLinksService.cancel(req.user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.paymentLinksService.remove(req.user.id, id);
  }
}
