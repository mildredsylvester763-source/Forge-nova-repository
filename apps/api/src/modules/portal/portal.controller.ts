import { Body, Controller, Get, Param, Post, Query, Request } from '@nestjs/common';
import { PortalService } from './portal.service';
import { OpenPortalSessionDto } from './dto/portal.dto';

@Controller('portals')
export class PortalController {
  constructor(private readonly portals: PortalService) {}

  @Post('sessions')
  async openSession(@Request() req: any, @Body() dto: OpenPortalSessionDto) {
    return this.portals.openSession(req.user.id, dto.customerEmail);
  }

  @Get('sessions')
  async listSessions(@Request() req: any) {
    return this.portals.listSessions(req.user.id);
  }

  @Post('sessions/:token/revoke')
  async revokeSession(@Request() req: any, @Param('token') token: string) {
    return this.portals.revokeSession(req.user.id, token);
  }

  @Get('visits')
  async listVisits(@Request() req: any) {
    return this.portals.listVisits(req.user.id);
  }

  // Token-accessible: a customer opens this with their secret token. It only
  // ever returns their own, redacted records.
  @Get(':token/:resource')
  async viewResource(
    @Param('token') token: string,
    @Param('resource') resource: string,
    @Query('customerEmail') customerEmail?: string,
  ) {
    return this.portals.viewResource(token, resource, customerEmail);
  }
}
