// ============================================================================
// FILE: /apps/api/src/modules/crm-activities/activities.controller.ts
// ============================================================================
// Zero-trust entry points: userId comes from the request, never the body.
// Static routes are declared before any ':id' route.

import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Request } from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/activity.dto';

@Controller('crm-activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateActivityDto) {
    return this.activitiesService.create(req.user.id, dto);
  }

  @Get('next-actions')
  nextActions(@Request() req: any) {
    return this.activitiesService.nextActions(req.user.id);
  }

  @Get()
  list(@Request() req: any) {
    return this.activitiesService.list(req.user.id);
  }

  @Post(':id/complete')
  complete(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.activitiesService.complete(req.user.id, id);
  }
}
