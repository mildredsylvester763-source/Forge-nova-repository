// ============================================================================
// FILE: /apps/api/src/modules/invoices/invoices.controller.ts
// ============================================================================
// Zero-trust entry points. Every route requires an authenticated user; the
// userId comes from the request context (set by the auth guard), never from
// the body — cross-tenant access is structurally impossible.

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
  Query,
  Request,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceStatus } from './enums';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Request() req: any, @Query('status') status?: string) {
    return this.invoicesService.findAll(req.user.id, this.parseStatus(status));
  }

  @Get('dunning/summary')
  dunningSummary(@Request() req: any) {
    return this.invoicesService.dunningSummary(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.findOne(req.user.id, id);
  }

  @Get(':id/dunning')
  dunning(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.dunning(req.user.id, id);
  }

  @Post(':id/send')
  send(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.markSent(req.user.id, id);
  }

  @Post(':id/pay')
  pay(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.markPaid(req.user.id, id);
  }

  @Post(':id/void')
  void(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.voidInvoice(req.user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.remove(req.user.id, id);
  }

  private parseStatus(raw?: string): InvoiceStatus | undefined {
    if (!raw) return undefined;
    const match = Object.values(InvoiceStatus).find((value) => value === raw);
    return match;
  }
}
