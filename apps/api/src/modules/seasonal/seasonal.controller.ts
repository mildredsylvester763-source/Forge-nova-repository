// ============================================================================
// FILE: /apps/api/src/modules/seasonal/seasonal.controller.ts
// ============================================================================
// Zero-trust entry points. userId comes from the authenticated request
// only. Static segment declared before the parameterized route. An unknown
// category name flows straight to the service, which answers 404 with a
// named reason — no silent empty calendars.

import { Controller, Get, Param, Query, Request } from '@nestjs/common';
import { SeasonalService } from './seasonal.service';
import { OpportunityCategory } from '../opportunities/enums';

@Controller('seasonal')
export class SeasonalController {
  constructor(private readonly seasonalService: SeasonalService) {}

  @Get('calendars')
  getCalendars(
    @Request() req: any,
    @Query('category') category?: string,
  ) {
    const parsed =
      category && (Object.values(OpportunityCategory) as string[]).includes(category)
        ? (category as OpportunityCategory)
        : undefined;
    return this.seasonalService.getCalendars(req.user.id, parsed);
  }

  @Get('calendars/:category')
  getCategoryCalendar(@Request() req: any, @Param('category') category: string) {
    return this.seasonalService.getCategoryCalendar(
      req.user.id,
      category as OpportunityCategory,
    );
  }
}
