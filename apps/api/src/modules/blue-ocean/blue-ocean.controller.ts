// ============================================================================
// FILE: /apps/api/src/modules/blue-ocean/blue-ocean.controller.ts
// ============================================================================
// Zero-trust entry point. userId comes from the authenticated request only.

import { Controller, Get, Query, Request } from '@nestjs/common';
import { BlueOceanService } from './blue-ocean.service';
import { OpportunityCategory } from '../opportunities/enums';

@Controller('blue-ocean')
export class BlueOceanController {
  constructor(private readonly blueOceanService: BlueOceanService) {}

  @Get()
  detect(
    @Request() req: any,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedCategory =
      category && (Object.values(OpportunityCategory) as string[]).includes(category)
        ? (category as OpportunityCategory)
        : undefined;
    return this.blueOceanService.detect(req.user.id, {
      category: parsedCategory,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
