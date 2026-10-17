// ============================================================================
// FILE: /apps/api/src/modules/integrations/integrations.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey } from './entities/api-key.entity';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { Integration } from './entities/integration.entity';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { McpService } from './mcp.service';
import { McpController } from './mcp.controller';
import { ApiKeyGuard } from './guards/api-key.guard';
import { AgentModule } from '../agent/agent.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ActivitiesModule } from '../crm-activities/activities.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey, WebhookEndpoint, WebhookDelivery, Integration]),
    AgentModule,
    InventoryModule,
    ActivitiesModule,
  ],
  controllers: [IntegrationsController, McpController],
  providers: [IntegrationsService, McpService, ApiKeyGuard],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
