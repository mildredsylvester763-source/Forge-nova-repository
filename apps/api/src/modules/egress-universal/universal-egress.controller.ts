// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/universal-egress.controller.ts
// ============================================================================
// Zero-trust: identity always comes from req.user, never the body. The one
// exception is the OAuth callback: the provider redirect carries no JWT —
// the single-use, 10-minute state secret is the bearer there.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { UniversalEgressService } from './universal-egress.service';
import {
  ConnectDestinationDto,
  DispatchEgressDto,
  UpdateConnectionMetaDto,
  UpdateConnectionPolicyDto,
  RotateCredentialsDto,
} from './dto/egress-universal.dto';
import { Public } from '../../common/decorators/public.decorator';

@Controller('egress-universal')
export class UniversalEgressController {
  constructor(private readonly egress: UniversalEgressService) {}

  // The catalog offer: all 888 destinations, or a searched / filtered /
  // paginated window of it. Unknown filters are refused by name.
  @Get('destinations')
  async listDestinations(
    @Query('search') search?: string,
    @Query('kind') kind?: string,
    @Query('authStyle') authStyle?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = this.egress.listDestinationCatalog({ search, kind, authStyle, limit, offset });
    if ('total' in result) {
      return {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        destinations: result.items,
      };
    }
    return { total: result.items.length, destinations: result.items };
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

  // The per-connection operational contract: retry ceiling, monthly call
  // cap, label. Every field optional; engine defaults apply elsewhere.
  @Patch('connections/:id/policy')
  async updatePolicy(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConnectionPolicyDto,
  ) {
    return this.egress.updateConnectionPolicy(req.user.id, id, {
      label: dto.label,
      maxAttempts: dto.maxAttempts,
      monthlyCallCap: dto.monthlyCallCap,
    });
  }

  // Connection metadata: tags and notes. The engine normalizes and bounds
  // them; malformed input is refused by name.
  @Patch('connections/:id/meta')
  async updateMeta(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConnectionMetaDto,
  ) {
    return this.egress.updateConnectionMeta(req.user.id, id, {
      label: dto.label,
      tags: dto.tags,
      notes: dto.notes,
    });
  }

  // Credential rotation: replace the sealed envelope with new credentials.
  // Health resets to unknown; the next probe must prove the rotation.
  @Post('connections/:id/rotate')
  @HttpCode(200)
  async rotateCredentials(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RotateCredentialsDto,
  ) {
    return this.egress.rotateConnectionCredentials(req.user.id, id, dto.credentials);
  }

  @Post('connections/:id/probe')
  @HttpCode(200)
  async probe(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.egress.probeConnection(req.user.id, id);
  }

  // Bulk probe: every connected connection in one call. onlyDue=true
  // probes just the connections whose cadence has elapsed — the plane a
  // scheduler hits periodically (scheduled probes without a hidden daemon).
  @Post('connections/probe-all')
  @HttpCode(200)
  async probeAll(@Request() req: any, @Query('onlyDue') onlyDue?: string) {
    const due = onlyDue === 'true' || onlyDue === '1';
    return this.egress.probeAllConnections(req.user.id, due);
  }

  // The health dashboard: counts, per-connection health, cadence, and
  // which connections are due for their next probe.
  @Get('connections/health')
  async health(@Request() req: any) {
    return this.egress.connectionHealthDashboard(req.user.id);
  }

  // ----------------------------------------------------------- oauth plane
  // Step 1 (authenticated): create a pending session, return the provider
  // authorize URL. Step 2 (public): the provider redirects here with
  // state + code; the single-use state secret binds it to the user.
  @Post('connections/oauth/:destinationId/begin')
  @HttpCode(200)
  async beginOauth(@Request() req: any, @Param('destinationId') destinationId: string) {
    return this.egress.beginOAuthConnection(req.user.id, destinationId);
  }

  @Public()
  @Get('callback')
  async oauthCallback(
    @Query('state') state?: string,
    @Query('code') code?: string,
    @Query('error') error?: string,
    @Query('error_description') error_description?: string,
  ) {
    return this.egress.completeOAuthCallback({ state, code, error, error_description });
  }

  @Post('connections/:id/refresh')
  @HttpCode(200)
  async refreshOauth(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.egress.refreshConnectionOAuth(req.user.id, id);
  }

  // -------------------------------------------------------------- dispatch
  // dryRun=true walks every gate with zero sockets and zero consumption:
  // quota, breaker, rate limit, monthly cap, and the exact header key set.
  @Post('dispatch')
  @HttpCode(200)
  async dispatch(
    @Request() req: any,
    @Body() dto: DispatchEgressDto,
    @Query('dryRun') dryRun?: string,
  ) {
    if (dryRun === 'true' || dryRun === '1') {
      return this.egress.dispatchDryRun(req.user.id, dto.connectionId, dto.method, dto.path);
    }
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

  // Call-log statistics over the recent window: outcomes, latency, and a
  // per-destination breakdown — aggregated from the append-only audit log.
  @Get('calls/stats')
  async callStats(@Request() req: any) {
    return this.egress.callStats(req.user.id);
  }

  @Get('quota')
  async quota(@Request() req: any) {
    return this.egress.quotaStatus(req.user.id);
  }
}
