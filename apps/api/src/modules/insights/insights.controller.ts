// ============================================================================
// FILE: /apps/api/src/modules/insights/insights.controller.ts
// ============================================================================
// Zero-trust entry points. userId comes from the authenticated request only.

import { Controller, Get, Request } from '@nestjs/common';
import { InsightsService } from './insights.service';

@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get('weekly-report')
  weeklyReport(@Request() req: any) {
    return this.insightsService.getWeeklyReport(req.user.id);
  }
}
