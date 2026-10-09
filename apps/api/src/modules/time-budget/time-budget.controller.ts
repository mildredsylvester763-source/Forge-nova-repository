// ============================================================================
// FILE: /apps/api/src/modules/time-budget/time-budget.controller.ts
// ============================================================================
// Zero-trust entry points. userId comes from the authenticated request
// context only. Static segments declared before parameterized routes.

import {
  Controller, Get, Post, Put, Body, Param, Query, Request,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { TimeBudgetService } from './time-budget.service';
import { UpsertTimeBudgetDto, RecordActualDto } from './dto/time-budget.dto';

@Controller('time-budget')
export class TimeBudgetController {
  constructor(private readonly timeBudgetService: TimeBudgetService) {}

  @Put('weeks')
  upsertWeek(@Request() req: any, @Body() dto: UpsertTimeBudgetDto) {
    return this.timeBudgetService.upsertWeek(req.user.id, dto);
  }

  @Get('weeks')
  listWeeks(@Request() req: any, @Query('page') page = 1, @Query('limit') limit = 20) {
    return this.timeBudgetService.listWeeks(req.user.id, Number(page), Number(limit));
  }

  @Post('weeks/:weekStart/actuals')
  @HttpCode(HttpStatus.OK)
  recordActual(
    @Request() req: any,
    @Param('weekStart') weekStart: string,
    @Body() dto: RecordActualDto,
  ) {
    return this.timeBudgetService.recordActual(req.user.id, weekStart, dto);
  }

  @Get('weeks/:weekStart')
  getWeek(@Request() req: any, @Param('weekStart') weekStart: string) {
    return this.timeBudgetService.getWeek(req.user.id, weekStart);
  }
}
