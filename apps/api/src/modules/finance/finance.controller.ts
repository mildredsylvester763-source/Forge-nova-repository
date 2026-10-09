// ============================================================================
// FILE: /apps/api/src/modules/finance/finance.controller.ts
// ============================================================================
// Zero-trust entry points. userId comes from the authenticated request only.

import { Controller, Get, Query, Request } from '@nestjs/common';
import { FinanceService } from './finance.service';

@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('cashflow/forecast')
  forecast(
    @Request() req: any,
    @Query('periods') periods?: string,
  ) {
    const parsed = periods ? Number(periods) : undefined;
    return this.financeService.getCashFlowForecast(req.user.id, Number.isFinite(parsed) ? parsed : undefined);
  }
}
