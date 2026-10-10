// ============================================================================
// FILE: /apps/api/src/modules/accounting/accounting.controller.ts
// ============================================================================
// Zero-trust entry points. Static segments before :id.

import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Request } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { CreateJournalDto } from './dto/create-journal.dto';
import { AccountType } from './entities/ledger-account.entity';

@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Post('chart/seed')
  @HttpCode(HttpStatus.OK)
  seedChart(@Request() req: any) {
    return this.accountingService.seedChart(req.user.id);
  }

  @Get('chart')
  findAccounts(@Request() req: any) {
    return this.accountingService.findAccounts(req.user.id);
  }

  @Post('chart')
  createAccount(
    @Request() req: any,
    @Body() body: { code?: string; name?: string; type?: string },
  ) {
    const type = (Object.values(AccountType) as string[]).includes(body.type ?? '')
      ? (body.type as AccountType)
      : undefined;
    if (!body.code || !body.name || !type) {
      throw new Error('code, name and a valid type are required');
    }
    return this.accountingService.createAccount(req.user.id, body.code, body.name, type);
  }

  @Get('trial-balance')
  trialBalance(@Request() req: any) {
    return this.accountingService.trialBalanceFor(req.user.id);
  }

  @Get('journals')
  findJournals(@Request() req: any) {
    return this.accountingService.findJournals(req.user.id);
  }

  @Post('journals')
  postJournal(@Request() req: any, @Body() dto: CreateJournalDto) {
    return this.accountingService.postJournal(req.user.id, dto);
  }

  @Post('post/invoice-issued/:invoiceId')
  @HttpCode(HttpStatus.OK)
  postInvoiceIssued(@Request() req: any, @Param('invoiceId', ParseUUIDPipe) invoiceId: string) {
    return this.accountingService.postInvoiceIssuedFor(req.user.id, invoiceId);
  }

  @Post('post/invoice-payment/:invoiceId')
  @HttpCode(HttpStatus.OK)
  postInvoicePayment(@Request() req: any, @Param('invoiceId', ParseUUIDPipe) invoiceId: string) {
    return this.accountingService.postInvoicePaymentFor(req.user.id, invoiceId);
  }

  @Post('post/credit-note/:noteId')
  @HttpCode(HttpStatus.OK)
  postCreditNote(@Request() req: any, @Param('noteId', ParseUUIDPipe) noteId: string) {
    return this.accountingService.postCreditNoteIssuedFor(req.user.id, noteId);
  }
}
