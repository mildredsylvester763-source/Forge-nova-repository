// ============================================================================
// FILE: /apps/api/src/modules/regulatory/regulatory.controller.ts
// ============================================================================
// Zero-trust entry points. userId comes from the authenticated request only.
// Static segments declared before the parameterized routes.

import { Controller, Get, Param, Query, Request } from '@nestjs/common';
import { RegulatoryService } from './regulatory.service';

@Controller('regulatory')
export class RegulatoryController {
  constructor(private readonly regulatoryService: RegulatoryService) {}

  @Get()
  assess(
    @Request() req: any,
    @Query('country') country: string,
    @Query('category') category: string,
  ) {
    return this.regulatoryService.assess(req.user.id, country, category);
  }

  @Get('opportunities/:opportunityId')
  assessForOpportunity(
    @Request() req: any,
    @Param('opportunityId') opportunityId: string,
    @Query('country') country: string,
  ) {
    return this.regulatoryService.assessForOpportunity(req.user.id, opportunityId, country);
  }
}
