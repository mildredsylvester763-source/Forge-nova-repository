// ============================================================================
// FILE: /apps/api/src/modules/budgets/budgets.controller.ts
// ============================================================================
// Zero-trust entry points: userId comes from the request, never the body.
// Static routes are declared before any ':id' route.

import { Body, Controller, Get, Post, Query, Request } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto } from './dto/budget.dto';

@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateBudgetDto) {
    return this.budgetsService.create(req.user.id, dto);
  }

  @Get()
  list(@Request() req: any) {
    return this.budgetsService.list(req.user.id);
  }

  @Get('variance')
  variance(
    @Request() req: any,
    @Query('category') category: string,
    @Query('month') month: string,
  ) {
    return this.budgetsService.variance(req.user.id, category ?? '', month ?? '');
  }
}
