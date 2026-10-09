// ============================================================================
// FILE: /apps/api/src/modules/pricing/pricing.controller.ts
// ============================================================================
// Zero-trust entry points. userId comes from the authenticated request only.

import { Body, Controller, Post, Param, Request } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { AnalyzePricingDto } from './dto/analyze-pricing.dto';

@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post('products/:productId/analyze')
  analyze(
    @Request() req: any,
    @Param('productId') productId: string,
    @Body() dto: AnalyzePricingDto,
  ) {
    return this.pricingService.analyzeProduct(req.user.id, productId, dto);
  }
}
