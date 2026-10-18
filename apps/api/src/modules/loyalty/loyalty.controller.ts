import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { EarnPointsDto, RedeemPointsDto } from './dto/loyalty.dto';

@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Post('earn')
  async earn(@Request() req: any, @Body() dto: EarnPointsDto) {
    return this.loyalty.earn(req.user.id, dto.amountCents, dto.reason);
  }

  @Post('redeem')
  async redeem(@Request() req: any, @Body() dto: RedeemPointsDto) {
    return this.loyalty.redeem(req.user.id, dto.points, dto.reason);
  }

  @Get()
  async account(@Request() req: any) {
    return this.loyalty.getAccount(req.user.id);
  }

  @Get('events')
  async events(@Request() req: any) {
    return this.loyalty.listEvents(req.user.id);
  }
}
