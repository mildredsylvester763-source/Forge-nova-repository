// ============================================================================
// FILE: /apps/api/src/modules/taxes/taxes.controller.ts
// ============================================================================
// Zero-trust entry points: userId comes from the request, never the body.
// Static routes are declared before any ':id' route.

import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { TaxesService } from './taxes.service';
import { FilingDto, VatDto, WithholdingDto } from './dto/tax.dto';

@Controller('taxes')
export class TaxesController {
  constructor(private readonly taxesService: TaxesService) {}

  @Post('vat')
  vat(@Request() req: any, @Body() dto: VatDto) {
    return this.taxesService.vat(req.user.id, dto);
  }

  @Post('withholding')
  withholding(@Request() req: any, @Body() dto: WithholdingDto) {
    return this.taxesService.withholding(req.user.id, dto);
  }

  @Post('filing')
  filing(@Request() req: any, @Body() dto: FilingDto) {
    return this.taxesService.filing(req.user.id, dto);
  }

  @Get('records')
  records(@Request() req: any) {
    return this.taxesService.records(req.user.id);
  }
}
