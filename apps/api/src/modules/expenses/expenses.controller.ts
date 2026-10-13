// ============================================================================
// FILE: /apps/api/src/modules/expenses/expenses.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Request } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateExpenseDto) {
    return this.expensesService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.expensesService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.expensesService.findOne(req.user.id, id);
  }
}
