// ============================================================================
// FILE: /apps/api/src/modules/integrations/integrations.service.ts
// ============================================================================
// The connection layer: API keys, webhook endpoints with signed dispatch
// and disciplined retries, and the connector catalog the platform OFFERS.
// Engines decide (scopes, subscriptions, backoff, credentials); this
// service persists and never guesses.

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, createHmac, randomBytes } from 'crypto';
import { ApiKey } from './entities/api-key.entity';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { Integration } from './entities/integration.entity';
import { CreateApiKeyDto, CreateWebhookEndpointDto, ConnectIntegrationDto, DispatchEventDto } from './dto/integrations.dto';
import { generateApiKey, validateScopes } from './engine/api-key';
import {
  CONNECTORS,
  lookupConnector,
  validateCredentials,
} from './engine/connector-catalog';
import { backoffSeconds, filterSubscriptions, nextStatus } from './engine/webhook-dispatch';

const SUBSCRIPTION_PATTERN = /^(all|[a-z][a-z0-9-]*\.(\*|[a-z][a-z0-9-]*))$/;

@Injectable()
export class IntegrationsService {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
    @InjectRepository(WebhookEndpoint)
    private readonly endpointRepository: Repository<WebhookEndpoint>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepository: Repository<WebhookDelivery>,
    @InjectRepository(Integration)
    private readonly integrationRepository: Repository<Integration>,
  ) {}

  // ---------------------------------------------------------------- API keys

  async createApiKey(userId: string, dto: CreateApiKeyDto) {
    const scopes = validateScopes(dto.scopes);
    if (!scopes.ok) {
      throw new BadRequestException(scopes.reason);
    }
    const entropy = randomBytes(20).toString('hex');
    const generated = generateApiKey(entropy);
    if (!generated.ok) {
      throw new BadRequestException(generated.reason);
    }
    const keyHash = createHash('sha256').update(generated.value.plaintext).digest('hex');
    const row = await this.apiKeyRepository.save(
      this.apiKeyRepository.create({
        userId,
        name: dto.name.trim(),
        keyHash,
        scopes: scopes.value.scopes,
      }),
    );
    // The plaintext is returned exactly once; only the hash is stored.
    return {
      id: row.id,
      name: row.name,
      scopes: row.scopes,
      key: generated.value.plaintext,
      createdAt: row.createdAt,
    };
  }

  async listApiKeys(userId: string) {
    const rows = await this.apiKeyRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      scopes: r.scopes,
      lastUsedAt: r.lastUsedAt,
      revokedAt: r.revokedAt,
      createdAt: r.createdAt,
    }));
  }

  async revokeApiKey(userId: string, id: string): Promise<ApiKey> {
    const row = await this.apiKeyRepository.findOne({ where: { userId, id } });
    if (!row) {
      throw new NotFoundException('apikey-not-found');
    }
    row.revokedAt = new Date();
    return this.apiKeyRepository.save(row);
  }

  // -------------------------------------------------------- webhook endpoints

  async createWebhookEndpoint(userId: string, dto: CreateWebhookEndpointDto) {
    for (const pattern of dto.events) {
      if (typeof pattern !== 'string' || !SUBSCRIPTION_PATTERN.test(pattern)) {
        throw new BadRequestException('webhook-invalid-subscription:' + String(pattern));
      }
    }
    const existing = await this.endpointRepository.findOne({
      where: { userId, url: dto.url },
      withDeleted: true,
    });
    if (existing) {
      throw new ConflictException('webhook-endpoint-exists');
    }
    return this.endpointRepository.save(
      this.endpointRepository.create({
        userId,
        url: dto.url,
        secret: dto.secret,
        events: dto.events,
        active: true,
      }),
    );
  }

  async listWebhookEndpoints(userId: string): Promise<WebhookEndpoint[]> {
    return this.endpointRepository.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async deleteWebhookEndpoint(userId: string, id: string) {
    const row = await this.endpointRepository.findOne({ where: { userId, id } });
    if (!row) {
      throw new NotFoundException('webhook-endpoint-not-found');
    }
    await this.endpointRepository.softDelete(row.id);
    return { deleted: true };
  }

  // ------------------------------------------------------------ webhook dispatch

  async dispatchEvent(userId: string, dto: DispatchEventDto) {
    const endpoints = await this.endpointRepository.find({
      where: { userId, active: true },
    });
    const now = new Date();
    const created: WebhookDelivery[] = [];
    for (const endpoint of endpoints) {
      const match = filterSubscriptions(endpoint.events, dto.event);
      if (!match.ok) {
        throw new BadRequestException(match.reason);
      }
      if (!match.value.matched.length) {
        continue;
      }
      created.push(
        await this.deliveryRepository.save(
          this.deliveryRepository.create({
            userId,
            endpointId: endpoint.id,
            event: dto.event,
            payload: dto.payload,
            status: 'pending',
            attempts: 0,
            nextAttemptAt: now,
          }),
        ),
      );
    }
    return { queued: created.length, deliveries: created.map((d) => d.id) };
  }

  async retryDelivery(userId: string, deliveryId: string) {
    const delivery = await this.deliveryRepository.findOne({
      where: { userId, id: deliveryId },
    });
    if (!delivery) {
      throw new NotFoundException('webhook-delivery-not-found');
    }
    if (delivery.status === 'delivered') {
      throw new ConflictException('webhook-already-delivered');
    }
    const backoff = backoffSeconds(delivery.attempts);
    if (!backoff.ok) {
      throw new ConflictException(backoff.reason);
    }
    const endpoint = await this.endpointRepository.findOne({
      where: { userId, id: delivery.endpointId },
    });
    if (!endpoint) {
      throw new NotFoundException('webhook-endpoint-not-found');
    }
    const body = JSON.stringify({ event: delivery.event, payload: delivery.payload });
    const signature = createHmac('sha256', endpoint.secret).update(body).digest('hex');
    let responseCode: number | undefined;
    try {
      const res = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forgenova-signature': signature,
          'x-forgenova-event': delivery.event,
        },
        body,
      });
      responseCode = res.status;
    } catch {
      responseCode = 0;
    }
    delivery.attempts += 1;
    delivery.lastResponseCode = responseCode;
    delivery.status = nextStatus(delivery.attempts - 1, responseCode >= 200 && responseCode < 300);
    if (delivery.status === 'delivered') {
      delivery.deliveredAt = new Date();
      delivery.nextAttemptAt = new Date();
    } else {
      delivery.nextAttemptAt = new Date(Date.now() + backoff.value.seconds * 1000);
    }
    await this.deliveryRepository.save(delivery);
    return {
      id: delivery.id,
      status: delivery.status,
      attempts: delivery.attempts,
      lastResponseCode: delivery.lastResponseCode,
      nextAttemptAt: delivery.nextAttemptAt,
    };
  }

  async listDeliveries(userId: string): Promise<WebhookDelivery[]> {
    return this.deliveryRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  // -------------------------------------------------------------- connectors

  listConnectors() {
    return CONNECTORS;
  }

  async connectIntegration(userId: string, dto: ConnectIntegrationDto) {
    const connector = lookupConnector(dto.connectorId);
    if (!connector.ok) {
      throw new BadRequestException(connector.reason);
    }
    const credentials = validateCredentials(dto.connectorId, dto.credentials);
    if (!credentials.ok) {
      throw new BadRequestException(credentials.reason);
    }
    const existing = await this.integrationRepository.findOne({
      where: { userId, connectorId: dto.connectorId },
      withDeleted: true,
    });
    if (existing) {
      throw new ConflictException('integration-exists:' + dto.connectorId);
    }
    return this.integrationRepository.save(
      this.integrationRepository.create({
        userId,
        connectorId: dto.connectorId,
        status: 'connected',
        credentials: dto.credentials,
      }),
    );
  }

  async listIntegrations(userId: string) {
    const rows = await this.integrationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((r) => ({
      id: r.id,
      connectorId: r.connectorId,
      status: r.status,
      credentialFields: Object.keys(r.credentials),
      lastSyncedAt: r.lastSyncedAt,
      createdAt: r.createdAt,
    }));
  }

  async disconnectIntegration(userId: string, id: string) {
    const row = await this.integrationRepository.findOne({ where: { userId, id } });
    if (!row) {
      throw new NotFoundException('integration-not-found');
    }
    row.status = 'disconnected';
    return this.integrationRepository.save(row);
  }
}
