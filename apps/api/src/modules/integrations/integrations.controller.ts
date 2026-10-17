// ============================================================================
// FILE: /apps/api/src/modules/integrations/integrations.controller.ts
// ============================================================================
// User-authenticated surface: API keys, webhook endpoints, deliveries, the
// connector catalog, and per-user connections. Zero-trust: every route
// reads the owner from req.user.id — never from the body.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
} from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import {
  ConnectIntegrationDto,
  CreateApiKeyDto,
  CreateWebhookEndpointDto,
  DispatchEventDto,
} from './dto/integrations.dto';

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  // API keys — plaintext returned exactly once at creation.
  @Post('api-keys')
  @HttpCode(201)
  createApiKey(@Request() req: any, @Body() dto: CreateApiKeyDto) {
    return this.integrationsService.createApiKey(req.user.id, dto);
  }

  @Get('api-keys')
  listApiKeys(@Request() req: any) {
    return this.integrationsService.listApiKeys(req.user.id);
  }

  @Delete('api-keys/:id')
  revokeApiKey(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.integrationsService.revokeApiKey(req.user.id, id);
  }

  // Webhook endpoints.
  @Post('webhooks')
  @HttpCode(201)
  createWebhook(@Request() req: any, @Body() dto: CreateWebhookEndpointDto) {
    return this.integrationsService.createWebhookEndpoint(req.user.id, dto);
  }

  @Get('webhooks')
  listWebhooks(@Request() req: any) {
    return this.integrationsService.listWebhookEndpoints(req.user.id);
  }

  @Delete('webhooks/:id')
  deleteWebhook(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.integrationsService.deleteWebhookEndpoint(req.user.id, id);
  }

  // Event dispatch and delivery discipline.
  @Post('webhooks/dispatch')
  @HttpCode(202)
  dispatchEvent(@Request() req: any, @Body() dto: DispatchEventDto) {
    return this.integrationsService.dispatchEvent(req.user.id, dto);
  }

  @Get('webhooks/deliveries')
  listDeliveries(@Request() req: any) {
    return this.integrationsService.listDeliveries(req.user.id);
  }

  @Post('webhooks/deliveries/:id/retry')
  @HttpCode(200)
  retryDelivery(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.integrationsService.retryDelivery(req.user.id, id);
  }

  // The connector catalog the platform OFFERS, and per-user connections.
  @Get('connectors')
  listConnectors() {
    return this.integrationsService.listConnectors();
  }

  @Post('connections')
  @HttpCode(201)
  connect(@Request() req: any, @Body() dto: ConnectIntegrationDto) {
    return this.integrationsService.connectIntegration(req.user.id, dto);
  }

  @Get('connections')
  listConnections(@Request() req: any) {
    return this.integrationsService.listIntegrations(req.user.id);
  }

  @Delete('connections/:id')
  disconnect(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.integrationsService.disconnectIntegration(req.user.id, id);
  }
}
