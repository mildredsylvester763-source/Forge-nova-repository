import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import { CreditService } from './credit-limits.service';
import {
  CreditChargeDto,
  CreditReleaseDto,
  SetCreditLimitDto,
} from './dto/credit-limits.dto';

@Controller('credits')
export class CreditLimitsController {
  constructor(private readonly credits: CreditService) {}

  @Post('limit')
  async setLimit(@Request() req: any, @Body() dto: SetCreditLimitDto) {
    return this.credits.setLimit(req.user.id, dto.customerRef, dto.limitCents);
  }

  @Post('charge')
  async charge(@Request() req: any, @Body() dto: CreditChargeDto) {
    return this.credits.charge(req.user.id, dto.customerRef, dto.chargeCents, dto.reason);
  }

  @Post('release')
  async release(@Request() req: any, @Body() dto: CreditReleaseDto) {
    return this.credits.release(req.user.id, dto.customerRef, dto.releaseCents, dto.reason);
  }

  @Get()
  async listCredits(@Request() req: any) {
    return this.credits.listCredits(req.user.id);
  }

  @Get('events')
  async listEvents(@Request() req: any) {
    return this.credits.listEvents(req.user.id);
  }

  @Get(':customerRef')
  async getCredit(@Request() req: any, @Param('customerRef') customerRef: string) {
    return this.credits.getCredit(req.user.id, customerRef);
  }
}
