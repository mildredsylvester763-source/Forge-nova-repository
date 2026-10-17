// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/universal-egress.service.ts
// ============================================================================
// The universal outbound connection plane. Every external call flows
// through here: SSRF wall -> quota -> sealed-credential auth header ->
// bounded retry with full jitter -> redacted call log. No raw socket
// anywhere else.

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { EgressConnection } from './entities/egress-connection.entity';
import { EgressCallLog } from './entities/egress-call-log.entity';
import { EgressQuota } from './entities/egress-quota.entity';
import {
  listDestinations,
  lookupDestination,
  validateCredentials,
  resolveBaseUrl,
  DestinationDefinition,
} from './engine/destination-catalog';
import { normalizeTarget } from './engine/url-policy';
import { buildEnvelope, parseEnvelope, fingerprintHex, redactCredentials, isSecretHeader } from './engine/credential-vault';
import { monthKey, consume, TIER_BUDGETS, QuotaTier } from './engine/quota';
import { isIdempotent, backoffSeconds, jitteredDelay, classifyForRetry, nextStatus, MAX_ATTEMPTS } from './engine/egress-retry';
import { classifyLatency, applyProbeResult } from './engine/probe';

const CALL_TIMEOUT_MS = 15000;
const PROBE_TIMEOUT_MS = 10000;
const MAX_RESPONSE_CHARS = 100000;

export interface EgressResponse {
  ok: boolean;
  statusCode: number | null;
  attempts: number;
  body: string | Record<string, unknown> | null;
  logId: string;
  latencyMs: number;
}

@Injectable()
export class UniversalEgressService {
  constructor(
    @InjectRepository(EgressConnection)
    private readonly connections: Repository<EgressConnection>,
    @InjectRepository(EgressCallLog)
    private readonly calls: Repository<EgressCallLog>,
    @InjectRepository(EgressQuota)
    private readonly quotas: Repository<EgressQuota>,
    private readonly config: ConfigService,
  ) {}

  // ------------------------------------------------------------------ keys
  private masterKeyBytes(): Buffer {
    const raw =
      this.config.get<string>('egressMasterKey') ||
      process.env.EGRESS_MASTER_KEY ||
      'forgenova-dev-egress-master-key';
    return createHash('sha256').update(raw).digest();
  }

  private sealCredentials(credentials: Record<string, string>): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKeyBytes(), iv);
    const ct = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(credentials), 'utf8')),
      cipher.final(),
    ]);
    const env = buildEnvelope(iv.toString('hex'), cipher.getAuthTag().toString('hex'), ct.toString('hex'));
    if (!env.ok) throw new BadRequestException(env.reason);
    return env.value.envelope;
  }

  private openCredentials(envelope: string): Record<string, string> {
    const parsed = parseEnvelope(envelope);
    if (!parsed.ok) throw new BadRequestException(parsed.reason);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.masterKeyBytes(),
      Buffer.from(parsed.value.ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(parsed.value.tagHex, 'hex'));
    const pt = Buffer.concat([
      decipher.update(Buffer.from(parsed.value.ciphertextHex, 'hex')),
      decipher.final(),
    ]);
    return JSON.parse(pt.toString('utf8')) as Record<string, string>;
  }

  // ----------------------------------------------------------- connections
  listDestinationCatalog(): DestinationDefinition[] {
    return listDestinations();
  }

  async listConnections(userId: string): Promise<Record<string, unknown>[]> {
    const rows = await this.connections.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => {
      const redacted = redactCredentials(this.openCredentials(row.credentialsEnvelope), row.credentialFingerprints);
      const fingerprints = redacted.ok ? redacted.value.redacted : {};
      return {
        id: row.id,
        destinationId: row.destinationId,
        label: row.label,
        baseUrl: row.baseUrl,
        status: row.status,
        healthStatus: row.healthStatus,
        consecutiveFailures: row.consecutiveFailures,
        consecutiveSuccesses: row.consecutiveSuccesses,
        lastProbedAt: row.lastProbedAt,
        createdAt: row.createdAt,
        credentialFingerprints: fingerprints,
      };
    });
  }

  async connectDestination(
    userId: string,
    destinationId: string,
    label: string | undefined,
    credentials: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const dest = lookupDestination(destinationId);
    if (!dest.ok) throw new BadRequestException(dest.reason);
    const validated = validateCredentials(destinationId, credentials);
    if (!validated.ok) throw new BadRequestException(validated.reason);
    const base = resolveBaseUrl(destinationId, validated.value.credentials);
    if (!base.ok) throw new BadRequestException(base.reason);
    const target = normalizeTarget(base.value.baseUrl);
    if (!target.ok) throw new BadRequestException(target.reason);

    const fingerprints: Record<string, string> = {};
    for (const key of Object.keys(validated.value.credentials)) {
      const digest = createHash('sha256').update(validated.value.credentials[key]).digest('hex');
      const fp = fingerprintHex(digest);
      if (!fp.ok) throw new BadRequestException(fp.reason);
      fingerprints[key] = fp.value.fp;
    }

    const existing = await this.connections.findOne({
      where: { userId, destinationId },
    });
    const row =
      existing ??
      this.connections.create({
        userId,
        destinationId,
        label: label ?? dest.value.name,
      });
    row.label = label ?? dest.value.name;
    row.credentialsEnvelope = this.sealCredentials(validated.value.credentials);
    row.credentialFingerprints = fingerprints;
    row.baseUrl = base.value.baseUrl;
    row.status = 'connected';
    row.healthStatus = 'unknown';
    row.consecutiveFailures = 0;
    row.consecutiveSuccesses = 0;
    const saved = await this.connections.save(row);
    return { id: saved.id, destinationId: saved.destinationId, label: saved.label, baseUrl: saved.baseUrl, status: saved.status };
  }

  async disconnectConnection(userId: string, connectionId: string): Promise<{ status: string }> {
    const row = await this.connections.findOne({ where: { id: connectionId, userId } });
    if (!row) throw new NotFoundException('egress-connection-not-found');
    row.status = 'disconnected';
    await this.connections.save(row);
    return { status: row.status };
  }

  // ------------------------------------------------------------------ probe
  async probeConnection(userId: string, connectionId: string): Promise<Record<string, unknown>> {
    const row = await this.connections.findOne({ where: { id: connectionId, userId } });
    if (!row) throw new NotFoundException('egress-connection-not-found');
    const dest = lookupDestination(row.destinationId);
    if (!dest.ok) throw new BadRequestException(dest.reason);
    const target = normalizeTarget(row.baseUrl.replace(/\/$/, '') + dest.value.healthPath);
    if (!target.ok) throw new BadRequestException(target.reason);

    const started = Date.now();
    let succeeded = false;
    let statusCode: number | null = null;
    let errorText: string | null = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
      const response = await fetch(target.value.origin + target.value.path, {
        method: 'GET',
        signal: controller.signal,
        headers: this.authHeaders(row),
      });
      clearTimeout(timer);
      statusCode = response.status;
      succeeded = response.ok;
    } catch (e: unknown) {
      errorText = e instanceof Error ? e.message : 'probe-transport-error';
    }
    const latencyMs = Date.now() - started;
    const band = classifyLatency(latencyMs);
    const bandStatus = band.ok ? band.value.status : 'down';
    const outcome = applyProbeResult(row.consecutiveFailures, row.consecutiveSuccesses, succeeded);
    if (!outcome.ok) throw new BadRequestException(outcome.reason);

    row.healthStatus = succeeded ? bandStatus : outcome.value.status;
    row.consecutiveFailures = outcome.value.consecutiveFailures;
    row.consecutiveSuccesses = outcome.value.consecutiveSuccesses;
    row.lastProbedAt = new Date();
    await this.connections.save(row);
    return {
      healthStatus: row.healthStatus,
      statusCode,
      latencyMs,
      errorText,
      consecutiveFailures: row.consecutiveFailures,
      consecutiveSuccesses: row.consecutiveSuccesses,
    };
  }

  private authHeaders(row: EgressConnection): Record<string, string> {
    const dest = lookupDestination(row.destinationId);
    if (!dest.ok) throw new BadRequestException(dest.reason);
    const creds = this.openCredentials(row.credentialsEnvelope);
    const headers: Record<string, string> = { 'user-agent': 'ForgeNova-Egress/1.0' };
    const d = dest.value;
    switch (d.authStyle) {
      case 'bearer':
        headers['authorization'] = 'Bearer ' + (creds.accessToken ?? creds.apiKey ?? creds.botToken ?? '');
        break;
      case 'api-key-header':
        const rawKey = creds.apiKey ?? creds.secretKey ?? creds.integrationToken ?? creds.accessToken ?? creds.botToken ?? creds.apiToken ?? '';
        headers[d.authHeader ?? 'authorization'] =
          d.id === 'wise' || d.id === 'termii' ? 'Bearer ' + rawKey : rawKey;
        break;
      case 'basic': {
        const user = creds.accountSid ?? creds.email ?? creds.consumerKey ?? creds.site ?? creds.username ?? '';
        const pass = creds.authToken ?? creds.apiToken ?? creds.consumerSecret ?? creds.password ?? '';
        headers['authorization'] =
          'Basic ' + Buffer.from(user + ':' + pass).toString('base64');
        break;
      }
      case 'query-param':
        // Query-param auth is appended in dispatch; probes keep it simple.
        break;
      case 'oauth-code':
        headers['authorization'] = 'Bearer ' + (creds.accessToken ?? '');
        break;
    }
    return headers;
  }

  // --------------------------------------------------------------- dispatch
  async listCalls(userId: string, limit: number): Promise<EgressCallLog[]> {
    return this.calls.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  async dispatch(
    userId: string,
    connectionId: string,
    method: string,
    path: string,
    body: Record<string, unknown> | undefined,
    extraHeaders: Record<string, string> | undefined,
  ): Promise<EgressResponse> {
    const row = await this.connections.findOne({ where: { id: connectionId, userId } });
    if (!row) throw new NotFoundException('egress-connection-not-found');
    if (row.status !== 'connected') throw new BadRequestException('egress-connection-not-connected');

    const dest = lookupDestination(row.destinationId);
    if (!dest.ok) throw new BadRequestException(dest.reason);

    const url = row.baseUrl.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path);
    const target = normalizeTarget(url);
    if (!target.ok) throw new BadRequestException(target.reason);

    // Quota gate.
    const month = monthKey(new Date().toISOString());
    if (!month.ok) throw new BadRequestException(month.reason);
    const quotaRow =
      (await this.quotas.findOne({ where: { userId, month: month.value.key } })) ??
      (await this.quotas.save(this.quotas.create({ userId, month: month.value.key, tier: 'free', used: 0 })));
    const tier = (['free', 'basic', 'pro'].includes(quotaRow.tier) ? quotaRow.tier : 'free') as QuotaTier;
    const granted = consume(tier, quotaRow.used, 1, month.value.key, month.value.key);
    if (!granted.ok) throw new BadRequestException(granted.reason);
    quotaRow.used = granted.value.used;
    await this.quotas.save(quotaRow);

    // Build headers: auth headers + caller extras (secret extras redacted in logs).
    const headers = this.authHeaders(row);
    for (const key of Object.keys(extraHeaders ?? {})) {
      headers[key.toLowerCase()] = (extraHeaders as Record<string, string>)[key];
    }
    let finalUrl = target.value.origin + target.value.path;
    if (dest.value.authStyle === 'query-param') {
      const creds = this.openCredentials(row.credentialsEnvelope);
      const token = creds.apiToken ?? creds.botToken ?? '';
      const joiner = finalUrl.includes('?') ? '&' : '?';
      finalUrl = token ? finalUrl + joiner + 'api_token=' + encodeURIComponent(token) : finalUrl;
    }

    const redactedHeaders: Record<string, string> = {};
    for (const key of Object.keys(headers)) {
      redactedHeaders[key] = isSecretHeader(key) ? 'redacted' : headers[key];
    }

    const started = Date.now();
    let attempts = 0;
    let statusCode: number | null = null;
    let succeeded = false;
    let errorText: string | null = null;
    let responseBody: string | Record<string, unknown> | null = null;

    while (attempts < MAX_ATTEMPTS) {
      attempts += 1;
      let retryClass: 'retry' | 'no-retry' = 'no-retry';
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
        const response = await fetch(finalUrl, {
          method,
          signal: controller.signal,
          headers,
          body: method === 'GET' || method === 'HEAD' || !body ? undefined : JSON.stringify(body),
        });
        clearTimeout(timer);
        statusCode = response.status;
        succeeded = response.status >= 200 && response.status < 300;
        const text = (await response.text()).slice(0, MAX_RESPONSE_CHARS);
        try {
          responseBody = JSON.parse(text) as Record<string, unknown>;
        } catch {
          responseBody = text;
        }
        const cls = classifyForRetry(response.status, false);
        if (!cls.ok) throw new BadRequestException(cls.reason);
        retryClass = cls.value;
      } catch (e: unknown) {
        if (e instanceof BadRequestException) throw e;
        errorText = e instanceof Error ? e.message : 'egress-transport-error';
        const cls = classifyForRetry(599, true);
        if (!cls.ok) throw new BadRequestException(cls.reason);
        retryClass = cls.value;
      }
      if (succeeded || retryClass === 'no-retry' || !isIdempotent(method)) break;
      if (attempts >= MAX_ATTEMPTS) break;
      const backoff = backoffSeconds(attempts - 1);
      if (backoff.ok) {
        await new Promise((resolve) => setTimeout(resolve, jitteredDelay(backoff.value.seconds, Math.random())));
      } else {
        break;
      }
    }

    const latencyMs = Date.now() - started;
    const outcome = nextStatus(attempts, succeeded);
    const log = await this.calls.save(
      this.calls.create({
        userId,
        connectionId: row.id,
        method,
        url: finalUrl,
        requestHeadersRedacted: redactedHeaders,
        requestBody: body ?? null,
        statusCode,
        outcome,
        attempts,
        latencyMs,
        errorText,
      }),
    );

    return {
      ok: succeeded,
      statusCode,
      attempts,
      body: responseBody,
      logId: log.id,
      latencyMs,
    };
  }

  async quotaStatus(userId: string): Promise<Record<string, unknown>> {
    const month = monthKey(new Date().toISOString());
    if (!month.ok) throw new BadRequestException(month.reason);
    const quotaRow = await this.quotas.findOne({ where: { userId, month: month.value.key } });
    const tier = (quotaRow?.tier as QuotaTier) ?? 'free';
    return {
      month: month.value.key,
      tier,
      budget: TIER_BUDGETS[tier] ?? TIER_BUDGETS.free,
      used: quotaRow?.used ?? 0,
      remaining: (TIER_BUDGETS[tier] ?? TIER_BUDGETS.free) - (quotaRow?.used ?? 0),
    };
  }
}
