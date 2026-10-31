import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { NpsService } from './nps.service';
import { RecordNpsResponseDto } from './dto/customer-health.dto';

@Controller('nps')
export class NpsController {
  constructor(private readonly nps: NpsService) {}

  @Post('responses')
  async recordResponse(@Request() req: any, @Body() dto: RecordNpsResponseDto) {
    return this.nps.recordResponse(
      req.user.id,
      dto.customerRef,
      dto.score,
      dto.comment,
      dto.channel,
    );
  }

  @Get('responses')
  async listResponses(@Request() req: any) {
    return this.nps.listResponses(req.user.id);
  }

  @Get('score')
  async computeScore(@Request() req: any) {
    return this.nps.computeScore(req.user.id);
  }

  @Get('detractors')
  async listDetractors(@Request() req: any) {
    return this.nps.listDetractors(req.user.id);
  }
}
