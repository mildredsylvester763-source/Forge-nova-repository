// ============================================================================
// FILE: /apps/api/src/modules/accounting/accounting.controller.ts
// ============================================================================
// Zero-trust entry points. Static segments before :id.

import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Request } from '@nestjs/common';
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
      throw new BadRequestException('code, name and a valid type are required');
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

  @Post('periods')
  createPeriod(
    @Request() req: any,
    @Body() body: { name?: string; startsAt?: string; endsAt?: string },
  ) {
    if (!body.name || !body.startsAt || !body.endsAt) {
      throw new BadRequestException('name, startsAt and endsAt are required');
    }
    return this.accountingService.createPeriod(req.user.id, body.name, body.startsAt, body.endsAt);
  }

  @Get('periods')
  listPeriods(@Request() req: any) {
    return this.accountingService.listPeriods(req.user.id);
  }

  @Post('periods/:id/close')
  @HttpCode(HttpStatus.OK)
  closePeriod(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.accountingService.closePeriod(req.user.id, id);
  }

  @Get('reports/profit-loss')
  profitAndLoss(@Request() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.accountingService.profitAndLossFor(req.user.id, from, to);
  }

  @Get('reports/balance-sheet')
  balanceSheet(@Request() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.accountingService.balanceSheetFor(req.user.id, from, to);
  }

  @Get('reports/cash-flow')
  cashFlow(@Request() req: any, @Query('from') from?: string, @Query('to') to?: string) {
    return this.accountingService.cashFlowFor(req.user.id, from, to);
  }

  @Post('post/credit-note/:noteId')
  @HttpCode(HttpStatus.OK)
  postCreditNote(@Request() req: any, @Param('noteId', ParseUUIDPipe) noteId: string) {
    return this.accountingService.postCreditNoteIssuedFor(req.user.id, noteId);
  }
}
