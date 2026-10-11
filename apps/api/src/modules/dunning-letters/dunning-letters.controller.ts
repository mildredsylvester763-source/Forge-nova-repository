// ============================================================================
// FILE: /apps/api/src/modules/dunning-letters/dunning-letters.controller.ts
// ============================================================================
// Zero-trust entry points. userId comes from the request context (set by the
// global auth guard), never from the body — cross-tenant access is
// structurally impossible, same convention as invoices.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Request,
} from '@nestjs/common';
import { DunningLettersService } from './dunning-letters.service';
import { ComposeLetterDto } from './dto/compose-letter.dto';

@Controller('dunning-letters')
export class DunningLettersController {
  constructor(private readonly service: DunningLettersService) {}

  @Post('invoices/:invoiceId/stages/:offsetDays')
  @HttpCode(HttpStatus.CREATED)
  compose(
    @Request() req: any,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Param('offsetDays', ParseIntPipe) offsetDays: number,
    @Body() dto: ComposeLetterDto,
  ) {
    return this.service.composeFor(req.user.id, invoiceId, offsetDays, {
      businessName: dto.businessName,
      senderName: dto.senderName,
    });
  }

  @Get()
  list(@Request() req: any) {
    return this.service.listAll(req.user.id);
  }

  @Get('invoices/:invoiceId')
  listForInvoice(@Request() req: any, @Param('invoiceId', ParseUUIDPipe) invoiceId: string) {
    return this.service.listForInvoice(req.user.id, invoiceId);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  send(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.markSent(req.user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(req.user.id, id);
  }
}
