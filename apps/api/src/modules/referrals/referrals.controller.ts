import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { ApplyReferralDto, RewardReferralDto } from './dto/referrals.dto';

@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Post('code')
  async code(@Request() req: any) {
    return this.referrals.generateCode(req.user.id);
  }

  @Post('apply')
  async apply(@Request() req: any, @Body() dto: ApplyReferralDto) {
    return this.referrals.apply(dto.code, req.user.id);
  }

  @Post('reward')
  async reward(@Body() dto: RewardReferralDto) {
    return this.referrals.reward(dto.refereeId, dto.purchaseCents);
  }

  @Get()
  async list(@Request() req: any) {
    return this.referrals.list(req.user.id);
  }
}
