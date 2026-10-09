// ============================================================================
// FILE: /apps/api/src/modules/alerts/alerts.controller.ts
// ============================================================================
// Zero-trust entry points. userId comes from the authenticated request
// only. Static segment declared before the parameterized route.

import {
  Controller, Get, Post, Param, Query, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { AlertSeverity } from './engine/alert-feed';

const SEVERITIES: AlertSeverity[] = ['critical', 'high', 'info'];

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  getFeed(
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('severity') severity?: string,
  ) {
    const parsedSeverity =
      severity && SEVERITIES.includes(severity as AlertSeverity)
        ? (severity as AlertSeverity)
        : undefined;
    return this.alertsService.getFeed(req.user.id, {
      limit: limit ? Number(limit) : undefined,
      severity: parsedSeverity,
    });
  }

  @Post(':opportunityId/spin-up')
  @HttpCode(HttpStatus.CREATED)
  spinUp(
    @Request() req: any,
    @Param('opportunityId') opportunityId: string,
  ) {
    return this.alertsService.spinUp(req.user.id, opportunityId);
  }
}
