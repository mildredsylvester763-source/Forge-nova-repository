// ============================================================================
// FILE: /apps/api/src/modules/portfolio/portfolio.controller.ts
// ============================================================================
// Zero-trust entry points. userId comes from the authenticated request
// context only. Both routes are read-only: a portfolio view is a read, and
// an allocation plan is advice, never an automatic spend.

import { Controller, Get, Post, Body, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { PortfolioService } from './portfolio.service';
import { AllocateCapitalDto } from './dto/allocate-capital.dto';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('risk')
  getRisk(@Request() req: any) {
    return this.portfolioService.getRisk(req.user.id);
  }

  @Post('allocation')
  @HttpCode(HttpStatus.OK)
  allocate(@Request() req: any, @Body() dto: AllocateCapitalDto) {
    return this.portfolioService.allocateCapital(req.user.id, dto);
  }
}
