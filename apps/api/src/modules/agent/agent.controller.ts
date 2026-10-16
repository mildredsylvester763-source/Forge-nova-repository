// ============================================================================
// FILE: /apps/api/src/modules/agent/agent.controller.ts
// ============================================================================
// Zero-trust entry points: userId comes from the request, never the body.
// Static routes are declared before any ':id' route.

import { Body, Controller, Get, Post, Query, Request } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentCommandDto } from './dto/agent-command.dto';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('commands')
  command(@Request() req: any, @Body() dto: AgentCommandDto) {
    return this.agentService.command(req.user.id, dto);
  }

  @Get('commands')
  history(@Request() req: any) {
    return this.agentService.commandHistory(req.user.id);
  }

  @Get('search')
  search(@Request() req: any, @Query('q') q: string) {
    return this.agentService.search(req.user.id, q ?? '');
  }

  @Get('reports/weekly')
  weekly(@Request() req: any) {
    return this.agentService.weeklyReportFor(req.user.id);
  }

  @Get('reports/cashflow')
  cashflow(@Request() req: any, @Query('days') days?: string) {
    const parsed = days ? parseInt(days, 10) : 90;
    return this.agentService.cashflowForecastFor(req.user.id, Number.isFinite(parsed) && parsed > 0 ? parsed : 90);
  }
}
