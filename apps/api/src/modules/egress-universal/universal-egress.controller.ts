// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/universal-egress.controller.ts
// ============================================================================
// Zero-trust: identity always comes from req.user, never the body.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { UniversalEgressService } from './universal-egress.service';
import { ConnectDestinationDto, DispatchEgressDto } from './dto/egress-universal.dto';

@Controller('egress-universal')
export class UniversalEgressController {
  constructor(private readonly egress: UniversalEgressService) {}

  @Get('destinations')
  async listDestinations() {
    return { destinations: this.egress.listDestinationCatalog() };
  }

  @Post('connections')
  @HttpCode(201)
  async connect(@Request() req: any, @Body() dto: ConnectDestinationDto) {
    return this.egress.connectDestination(
      req.user.id,
      dto.destinationId,
      dto.label,
      dto.credentials,
    );
  }

  @Get('connections')
  async listConnections(@Request() req: any) {
    return { connections: await this.egress.listConnections(req.user.id) };
  }

  @Delete('connections/:id')
  async disconnect(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.egress.disconnectConnection(req.user.id, id);
  }

  @Post('connections/:id/probe')
  @HttpCode(200)
  async probe(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.egress.probeConnection(req.user.id, id);
  }

  @Post('dispatch')
  @HttpCode(200)
  async dispatch(@Request() req: any, @Body() dto: DispatchEgressDto) {
    return this.egress.dispatch(
      req.user.id,
      dto.connectionId,
      dto.method,
      dto.path,
      dto.body,
      dto.headers,
    );
  }

  @Get('calls')
  async listCalls(@Request() req: any, @Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 20;
    return { calls: await this.egress.listCalls(req.user.id, Number.isFinite(parsed) ? parsed : 20) };
  }

  @Get('quota')
  async quota(@Request() req: any) {
    return this.egress.quotaStatus(req.user.id);
  }
}
