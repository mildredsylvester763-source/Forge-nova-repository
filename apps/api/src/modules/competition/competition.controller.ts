// ============================================================================
// FILE: /apps/api/src/modules/competition/competition.controller.ts
// ============================================================================
// Zero-trust entry points. userId comes from the authenticated request only.

import { Controller, Get, Param, Request } from '@nestjs/common';
import { CompetitionService } from './competition.service';

@Controller('competition')
export class CompetitionController {
  constructor(private readonly competitionService: CompetitionService) {}

  @Get('opportunities/:opportunityId')
  analyze(@Request() req: any, @Param('opportunityId') opportunityId: string) {
    return this.competitionService.analyzeOpportunity(req.user.id, opportunityId);
  }
}
