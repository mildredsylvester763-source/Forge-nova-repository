// ============================================================================
// FILE: /apps/api/src/modules/geo/geo.controller.ts
// ============================================================================
// Zero-trust entry point. userId comes from the authenticated request only.

import { Controller, Get, Query, Request } from '@nestjs/common';
import { GeoService } from './geo.service';
import { OpportunityCategory } from '../opportunities/enums';

@Controller('geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get('heatmap')
  getHeatmap(
    @Request() req: any,
    @Query('category') category?: string,
    @Query('minSamples') minSamples?: string,
  ) {
    const parsedCategory =
      category && (Object.values(OpportunityCategory) as string[]).includes(category)
        ? (category as OpportunityCategory)
        : undefined;
    return this.geoService.getHeatmap(req.user.id, {
      category: parsedCategory,
      minSamples: minSamples ? Number(minSamples) : undefined,
    });
  }
}
