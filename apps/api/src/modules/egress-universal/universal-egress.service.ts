// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/universal-egress.service.ts
// ============================================================================
// The universal outbound connection plane. Every external call flows
// through here: SSRF wall -> quota -> per-destination circuit breaker ->
// per-destination rate limit -> per-destination monthly cap -> sealed-
// credential auth header -> bounded retry with full jitter -> redacted
// call log. No raw socket anywhere else.

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { EgressConnection } from './entities/egress-connection.entity';
import { EgressCallLog } from './entities/egress-call-log.entity';
import { EgressQuota } from './entities/egress-quota.entity';
import { EgressOauthSession } from './entities/egress-oauth-session.entity';
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
import { classifyLatency, applyProbeResult, nextProbeMinutes } from './engine/probe';
import { buildAuthorizePlan } from './engine/oauth-plan';
import {
  planOAuthSession,
  sessionIsLive,
  validateCallback,
  buildTokenExchangeRequest,
  parseTokenResponse,
  buildRefreshRequest,
} from './engine/oauth-session';
import { newBucket, takeToken, BucketState } from './engine/rate-limit';
import { initialBreaker, canAttempt, recordResult, BreakerSnapshot, BREAKER_COOLDOWN_MS } from './engine/circuit-breaker';
import { searchDestinations, DestinationQuery, QueryResult } from './engine/destination-query';
import { lookupOAuthProvider, OAUTH_REDIRECT_PATH } from './catalog/oauth-providers';

const CALL_TIMEOUT_MS = 15000;
const PROBE_TIMEOUT_MS = 10000;
const MAX_RESPONSE_CHARS = 100000;
const OAUTH_EXCHANGE_TIMEOUT_MS = 15000;

// Per-destination operational defaults: a 60-call burst, refilled at
// 60/minute, and a breaker that trips after 5 consecutive dispatch
// failures and stays open for one minute before the half-open probe.
const RATE_BUCKET_CAPACITY = 60;
const RATE_REFILL_PER_MINUTE = 60;
const STATS_WINDOW = 1000;
const POLICY_MAX_ATTEMPTS_CEILING = 4;
const POLICY_MAX_CAP = 1000000;

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
  // In-memory operational state. Buckets and breakers are pure data; the
  // engines own every decision, this Map only stores it. Keyed by
  // userId + ':' + destinationId so one user's noisy destination never
  // punishes another user's quiet one.
  private readonly rateBuckets = new Map<string, BucketState>();
  private readonly breakers = new Map<string, BreakerSnapshot>();

  constructor(
    @InjectRepository(EgressConnection)
    private readonly connections: Repository<EgressConnection>,
    @InjectRepository(EgressCallLog)
    private readonly calls: Repository<EgressCallLog>,
    @InjectRepository(EgressQuota)
    private readonly quotas: Repository<EgressQuota>,
    @InjectRepository(EgressOauthSession)
    private readonly oauthSessions: Repository<EgressOauthSession>,
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
  listDestinationCatalog(query?: DestinationQuery): QueryResult<DestinationDefinition> | { items: DestinationDefinition[] } {
    if (query && Object.values(query).some((v) => v !== undefined && v !== null && v !== '')) {
      const result = searchDestinations(listDestinations(), query);
      if (!result.ok) throw new BadRequestException(result.reason);
      return result.value;
    }
    return { items: listDestinations() };
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
        maxAttempts: row.maxAttempts ?? null,
        monthlyCallCap: row.monthlyCallCap ?? null,
        monthlyCallsUsed: row.monthlyCallsUsed,
        callsMonth: row.callsMonth,
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

  // ------------------------------------------------- per-connection policy
  // The operational contract of one connection: retry ceiling and monthly
  // call cap. Everything is explicit  nothing is guessed, nothing silent.
  async updateConnectionPolicy(
    userId: string,
    connectionId: string,
    patch: { label?: string; maxAttempts?: number; monthlyCallCap?: number },
  ): Promise<Record<string, unknown>> {
    const row = await this.connections.findOne({ where: { id: connectionId, userId } });
    if (!row) throw new NotFoundException('egress-connection-not-found');

    if (patch.label !== undefined) {
      if (typeof patch.label !== 'string' || patch.label.trim().length === 0 || patch.label.length > 120) {
        throw new BadRequestException('policy-invalid-label');
      }
      row.label = patch.label;
    }
    if (patch.maxAttempts !== undefined) {
      if (!Number.isInteger(patch.maxAttempts) || patch.maxAttempts < 1 || patch.maxAttempts > POLICY_MAX_ATTEMPTS_CEILING) {
        throw new BadRequestException('policy-invalid-max-attempts');
      }
      row.maxAttempts = patch.maxAttempts;
    }
    if (patch.monthlyCallCap !== undefined) {
      if (!Number.isInteger(patch.monthlyCallCap) || patch.monthlyCallCap < 1 || patch.monthlyCallCap > POLICY_MAX_CAP) {
        throw new BadRequestException('policy-invalid-monthly-cap');
      }
      row.monthlyCallCap = patch.monthlyCallCap;
      const month = monthKey(new Date().toISOString());
      if (!month.ok) throw new BadRequestException(month.reason);
      if (row.callsMonth !== month.value.key) {
        row.callsMonth = month.value.key;
        row.monthlyCallsUsed = 0;
      }
    }

    const saved = await this.connections.save(row);
    return {
      id: saved.id,
      label: saved.label,
      maxAttempts: saved.maxAttempts ?? null,
      monthlyCallCap: saved.monthlyCallCap ?? null,
      monthlyCallsUsed: saved.monthlyCallsUsed,
      callsMonth: saved.callsMonth,
    };
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

  // Probe cadence: the engine decides when a connection is next due. A
  // never-probed connection is always due.
  private probeCadenceMinutes(row: EgressConnection): number {
    const cadence = nextProbeMinutes(row.consecutiveFailures ?? 0, row.consecutiveSuccesses ?? 0);
    return cadence.ok ? cadence.value.minutes : 60;
  }

  private connectionIsDue(row: EgressConnection, nowMs: number): boolean {
    if (!row.lastProbedAt) return true;
    return nowMs >= row.lastProbedAt.getTime() + this.probeCadenceMinutes(row) * 60000;
  }

  // Bulk probe: every connected connection in one call. onlyDue restricts
  // it to connections whose probe cadence has elapsed (the scheduled-probe
  // plane: cron hits this endpoint and only stale connections are asked).
  async probeAllConnections(userId: string, onlyDue: boolean): Promise<Record<string, unknown>> {
    const rows = await this.connections.find({ where: { userId, status: 'connected' } });
    const nowMs = Date.now();
    const results: Record<string, unknown>[] = [];
    let skipped = 0;
    for (const row of rows) {
      if (onlyDue && !this.connectionIsDue(row, nowMs)) {
        skipped += 1;
        continue;
      }
      try {
        const probed = await this.probeConnection(userId, row.id);
        results.push({
          connectionId: row.id,
          destinationId: row.destinationId,
          ...probed,
        });
      } catch (e: unknown) {
        results.push({
          connectionId: row.id,
          destinationId: row.destinationId,
          error: e instanceof Error ? e.message : 'probe-error',
        });
      }
    }
    const errored = results.filter((r) => typeof r.error === 'string').length;
    return {
      probed: results.length - errored,
      errored,
      skipped,
      results,
    };
  }

  // Connection health dashboard: one honest picture of every connection.
  async connectionHealthDashboard(userId: string): Promise<Record<string, unknown>> {
    const rows = await this.connections.find({ where: { userId }, order: { createdAt: 'DESC' } });
    const nowMs = Date.now();
    const counts: Record<string, number> = { healthy: 0, degraded: 0, down: 0, unknown: 0, disconnected: 0 };
    const connections: Record<string, unknown>[] = [];
    let dueForProbe = 0;
    for (const row of rows) {
      if (row.status !== 'connected') {
        counts.disconnected += 1;
      } else if (row.healthStatus in counts) {
        counts[row.healthStatus] += 1;
      } else {
        counts.unknown += 1;
      }
      const due = row.status === 'connected' && this.connectionIsDue(row, nowMs);
      if (due) dueForProbe += 1;
      connections.push({
        id: row.id,
        destinationId: row.destinationId,
        label: row.label,
        status: row.status,
        healthStatus: row.healthStatus,
        consecutiveFailures: row.consecutiveFailures,
        consecutiveSuccesses: row.consecutiveSuccesses,
        lastProbedAt: row.lastProbedAt,
        nextProbeInMinutes: row.status === 'connected' ? this.probeCadenceMinutes(row) : null,
        dueForProbe: due,
        monthlyCallCap: row.monthlyCallCap ?? null,
        monthlyCallsUsed: row.monthlyCallsUsed,
        callsMonth: row.callsMonth,
      });
    }
    return {
      total: rows.length,
      counts,
      dueForProbe,
      connections,
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

  // Call-log statistics over the most recent window: totals, outcomes,
  // latency, and per-destination breakdowns. Aggregated from the audit
  // log  nothing is estimated, nothing invented.
  async callStats(userId: string): Promise<Record<string, unknown>> {
    const rows = await this.calls.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: STATS_WINDOW,
    });
    const connectionRows = await this.connections.find({ where: { userId } });
    const destinationOf = new Map<string, string>();
    for (const c of connectionRows) destinationOf.set(c.id, c.destinationId);

    let total = 0;
    let succeeded = 0;
    let latencyTotalMs = 0;
    let latencyMaxMs = 0;
    const byOutcome: Record<string, number> = {};
    const perDestination = new Map<string, { calls: number; succeeded: number; latencyTotalMs: number; lastCalledAt: Date | null }>();
    let firstAt: Date | null = null;
    let lastAt: Date | null = null;

    for (const row of rows) {
      total += 1;
      const okCall = row.statusCode !== null && row.statusCode >= 200 && row.statusCode < 300;
      if (okCall) succeeded += 1;
      const outcome = row.outcome ?? 'unknown';
      byOutcome[outcome] = (byOutcome[outcome] ?? 0) + 1;
      latencyTotalMs += row.latencyMs ?? 0;
      latencyMaxMs = Math.max(latencyMaxMs, row.latencyMs ?? 0);
      if (!firstAt || row.createdAt < firstAt) firstAt = row.createdAt;
      if (!lastAt || row.createdAt > lastAt) lastAt = row.createdAt;
      const destinationId = destinationOf.get(row.connectionId) ?? 'unknown';
      const bucket = perDestination.get(destinationId) ?? { calls: 0, succeeded: 0, latencyTotalMs: 0, lastCalledAt: null };
      bucket.calls += 1;
      if (okCall) bucket.succeeded += 1;
      bucket.latencyTotalMs += row.latencyMs ?? 0;
      if (!bucket.lastCalledAt || row.createdAt > bucket.lastCalledAt) bucket.lastCalledAt = row.createdAt;
      perDestination.set(destinationId, bucket);
    }

    const destinations: Record<string, unknown>[] = [];
    for (const [destinationId, bucket] of perDestination) {
      destinations.push({
        destinationId,
        calls: bucket.calls,
        succeeded: bucket.succeeded,
        successRate: bucket.calls === 0 ? 0 : bucket.succeeded / bucket.calls,
        avgLatencyMs: bucket.calls === 0 ? 0 : Math.round(bucket.latencyTotalMs / bucket.calls),
        lastCalledAt: bucket.lastCalledAt,
      });
    }
    destinations.sort((a, b) => (b.calls as number) - (a.calls as number));

    return {
      window: rows.length,
      total,
      succeeded,
      successRate: total === 0 ? 0 : succeeded / total,
      avgLatencyMs: total === 0 ? 0 : Math.round(latencyTotalMs / total),
      maxLatencyMs: latencyMaxMs,
      byOutcome,
      firstCalledAt: firstAt,
      lastCalledAt: lastAt,
      perDestination: destinations,
    };
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

    const nowMs = Date.now();
    const month = monthKey(new Date(nowMs).toISOString());
    if (!month.ok) throw new BadRequestException(month.reason);

    // Quota gate (plan tier).
    const quotaRow =
      (await this.quotas.findOne({ where: { userId, month: month.value.key } })) ??
      (await this.quotas.save(this.quotas.create({ userId, month: month.value.key, tier: 'free', used: 0 })));
    const tier = (['free', 'basic', 'pro'].includes(quotaRow.tier) ? quotaRow.tier : 'free') as QuotaTier;
    const granted = consume(tier, quotaRow.used, 1, month.value.key, month.value.key);
    if (!granted.ok) throw new BadRequestException(granted.reason);
    quotaRow.used = granted.value.used;
    await this.quotas.save(quotaRow);

    // Per-destination monthly cap gate.
    const monthlyCap = row.monthlyCallCap ?? null;
    if (monthlyCap !== null) {
      if (row.callsMonth !== month.value.key) {
        row.callsMonth = month.value.key;
        row.monthlyCallsUsed = 0;
      }
      if (row.monthlyCallsUsed >= monthlyCap) {
        throw new BadRequestException('destination-quota-exceeded');
      }
    }

    // Circuit breaker gate: a destination that just failed repeatedly is
    // refused by name until its cooldown elapses.
    const breakerKey = userId + ':' + row.destinationId;
    const breakerSnapshot = this.breakers.get(breakerKey) ?? initialBreaker();
    const attemptDecision = canAttempt(breakerSnapshot, nowMs, BREAKER_COOLDOWN_MS);
    if (!attemptDecision.ok) throw new BadRequestException(attemptDecision.reason);

    // Per-destination rate limit gate (token bucket).
    const rateKey = userId + ':' + row.destinationId;
    const existingBucket = this.rateBuckets.get(rateKey);
    const freshBucket = newBucket(RATE_BUCKET_CAPACITY, nowMs);
    const bucket = existingBucket ?? (freshBucket.ok ? freshBucket.value : null);
    if (!bucket) throw new BadRequestException('rate-limit-bucket-init-failed');
    const token = takeToken(bucket, RATE_BUCKET_CAPACITY, RATE_REFILL_PER_MINUTE, nowMs, 1);
    if (!token.ok) throw new BadRequestException(token.reason);
    this.rateBuckets.set(rateKey, token.value.state);

    // Build headers: auth headers + caller extras (secret extras redacted in logs).
    const headers = this.authHeaders(row);
    for (const key of Object.keys(extraHeaders ?? {})) {
      headers[key.toLowerCase()] = (extraHeaders as Record<string, string>)[key];
    }
    let finalUrl = target.value.origin + target.value.path;
    if (dest.value.authStyle === 'query-param') {
      const creds = this.openCredentials(row.credentialsEnvelope);
      const token2 = creds.apiToken ?? creds.botToken ?? '';
      const joiner = finalUrl.includes('?') ? '&' : '?';
      finalUrl = token2 ? finalUrl + joiner + 'api_token=' + encodeURIComponent(token2) : finalUrl;
    }

    const redactedHeaders: Record<string, string> = {};
    for (const key of Object.keys(headers)) {
      redactedHeaders[key] = isSecretHeader(key) ? 'redacted' : headers[key];
    }

    // Per-connection retry policy: the ceiling defaults to the engine
    // maximum and can be tightened per connection.
    const attemptCeiling = row.maxAttempts ?? MAX_ATTEMPTS;

    const started = Date.now();
    let attempts = 0;
    let statusCode: number | null = null;
    let succeeded = false;
    let errorText: string | null = null;
    let responseBody: string | Record<string, unknown> | null = null;

    while (attempts < attemptCeiling) {
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
      if (attempts >= attemptCeiling) break;
      const backoff = backoffSeconds(attempts - 1);
      if (backoff.ok) {
        await new Promise((resolve) => setTimeout(resolve, jitteredDelay(backoff.value.seconds, Math.random())));
      } else {
        break;
      }
    }

    // Record the verdict into the breaker state machine.
    const breakerNext = recordResult(breakerSnapshot, succeeded, Date.now());
    if (breakerNext.ok) this.breakers.set(breakerKey, breakerNext.value);

    // Count the call against the per-destination monthly cap.
    if (monthlyCap !== null) {
      row.monthlyCallsUsed = (row.monthlyCallsUsed ?? 0) + 1;
      await this.connections.save(row);
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

  // ------------------------------------------------------------ oauth flow
  // The browser "tap to connect" plane. Forge Nova owns the developer app
  // for each provider; the user supplies nothing but their provider login.
  // state is a single-use secret; the PKCE verifier never leaves the
  // server. All decisions come from the pure engines.

  private oauthAppCredentials(provider: { envKey: string }): { clientId: string; clientSecret: string } {
    const clientId =
      process.env['OAUTH_' + provider.envKey + '_CLIENT_ID'] ?? '';
    const clientSecret =
      process.env['OAUTH_' + provider.envKey + '_CLIENT_SECRET'] ?? '';
    if (!clientId || !clientSecret) {
      throw new BadRequestException('oauth-client-not-configured:' + provider.envKey);
    }
    return { clientId, clientSecret };
  }

  private oauthRedirectUri(): string {
    const origin =
      this.config.get<string>('appPublicBaseUrl') ||
      process.env.APP_PUBLIC_BASE_URL ||
      'https://app.forgenova.com';
    return origin.replace(/\/$/, '') + OAUTH_REDIRECT_PATH;
  }

  async beginOAuthConnection(
    userId: string,
    destinationId: string,
  ): Promise<Record<string, unknown>> {
    const dest = lookupDestination(destinationId);
    if (!dest.ok) throw new BadRequestException(dest.reason);
    const provider = lookupOAuthProvider(destinationId);
    if (!provider) throw new BadRequestException('oauth-destination-not-oauth:' + destinationId);
    const { clientId } = this.oauthAppCredentials(provider);

    const state = randomBytes(24).toString('base64url');
    const codeVerifier = randomBytes(48).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const now = Date.now();
    const plan = planOAuthSession(state, codeVerifier, codeChallenge, now);
    if (!plan.ok) throw new BadRequestException(plan.reason);

    const redirectUri = this.oauthRedirectUri();
    const authorize = buildAuthorizePlan(
      { authorizeUrl: provider.authorizeUrl, tokenUrl: provider.tokenUrl, scopes: provider.scopes, usePkce: provider.usePkce },
      clientId,
      redirectUri,
      state,
      provider.scopes,
      provider.usePkce ? codeChallenge : null,
    );
    if (!authorize.ok) throw new BadRequestException(authorize.reason);

    await this.oauthSessions.save(
      this.oauthSessions.create({
        userId,
        destinationId,
        state,
        codeVerifier,
        codeChallenge,
        redirectUri,
        status: 'pending',
      }),
    );
    return {
      authorizeUrl: authorize.value.url,
      state,
      expiresAt: new Date(plan.value.expiresAtMs).toISOString(),
    };
  }

  async completeOAuthCallback(
    query: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const cb = validateCallback(query);
    if (!cb.ok) throw new BadRequestException(cb.reason);

    const session = await this.oauthSessions.findOne({
      where: { state: cb.value.state },
    });
    if (!session) throw new BadRequestException('oauth-session-not-found');
    if (session.status !== 'pending') throw new BadRequestException('oauth-session-already-used');
    const live = sessionIsLive(session.createdAt.getTime(), Date.now());
    if (!live.ok) throw new BadRequestException(live.reason);
    if (!live.value.live) throw new BadRequestException('oauth-session-expired');

    const provider = lookupOAuthProvider(session.destinationId);
    if (!provider) throw new BadRequestException('oauth-destination-not-oauth:' + session.destinationId);
    const { clientId, clientSecret } = this.oauthAppCredentials(provider);

    const exchange = buildTokenExchangeRequest(
      provider.tokenUrl,
      { usePkce: provider.usePkce, secretInBody: provider.secretInBody },
      clientId,
      clientSecret,
      cb.value.code,
      session.redirectUri,
      provider.usePkce ? session.codeVerifier : null,
    );
    if (!exchange.ok) throw new BadRequestException(exchange.reason);

    // The token endpoint is an outbound call like any other: SSRF wall first.
    const target = normalizeTarget(exchange.value.url);
    if (!target.ok) throw new BadRequestException(target.reason);

    const headers: Record<string, string> = {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    };
    if (exchange.value.basicAuth) {
      headers['authorization'] =
        'Basic ' + Buffer.from(exchange.value.basicAuth.username + ':' + exchange.value.basicAuth.password).toString('base64');
    }
    const params = new URLSearchParams(exchange.value.body).toString();

    let payload: unknown = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OAUTH_EXCHANGE_TIMEOUT_MS);
      const response = await fetch(target.value.origin + target.value.path, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: params,
      });
      clearTimeout(timer);
      const text = (await response.text()).slice(0, MAX_RESPONSE_CHARS);
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    } catch {
      throw new BadRequestException('oauth-token-exchange-transport-error');
    }

    const now = Date.now();
    const parsed = parseTokenResponse(payload, now);
    if (!parsed.ok) throw new BadRequestException(parsed.reason);

    const credentials: Record<string, string> = { accessToken: parsed.value.accessToken };
    if (parsed.value.refreshToken) credentials.refreshToken = parsed.value.refreshToken;

    const dest = lookupDestination(session.destinationId);
    if (!dest.ok) throw new BadRequestException(dest.reason);
    const validated = validateCredentials(session.destinationId, credentials);
    if (!validated.ok) throw new BadRequestException(validated.reason);
    const base = resolveBaseUrl(session.destinationId, validated.value.credentials);
    if (!base.ok) throw new BadRequestException(base.reason);
    const baseTarget = normalizeTarget(base.value.baseUrl);
    if (!baseTarget.ok) throw new BadRequestException(baseTarget.reason);

    const fingerprints: Record<string, string> = {};
    for (const key of Object.keys(validated.value.credentials)) {
      const digest = createHash('sha256').update(validated.value.credentials[key]).digest('hex');
      const fp = fingerprintHex(digest);
      if (!fp.ok) throw new BadRequestException(fp.reason);
      fingerprints[key] = fp.value.fp;
    }

    const existing = await this.connections.findOne({
      where: { userId: session.userId, destinationId: session.destinationId },
    });
    const row =
      existing ??
      this.connections.create({
        userId: session.userId,
        destinationId: session.destinationId,
        label: dest.value.name,
      });
    row.label = existing?.label ?? dest.value.name;
    row.credentialsEnvelope = this.sealCredentials(validated.value.credentials);
    row.credentialFingerprints = fingerprints;
    row.baseUrl = base.value.baseUrl;
    row.status = 'connected';
    row.healthStatus = 'unknown';
    row.consecutiveFailures = 0;
    row.consecutiveSuccesses = 0;
    const saved = await this.connections.save(row);

    session.status = 'completed';
    await this.oauthSessions.save(session);

    return {
      ok: true,
      connectionId: saved.id,
      destinationId: saved.destinationId,
      label: saved.label,
      baseUrl: saved.baseUrl,
      status: saved.status,
      expiresAt: parsed.value.expiresAtMs ? new Date(parsed.value.expiresAtMs).toISOString() : null,
    };
  }

  async refreshConnectionOAuth(
    userId: string,
    connectionId: string,
  ): Promise<Record<string, unknown>> {
    const row = await this.connections.findOne({ where: { id: connectionId, userId } });
    if (!row) throw new NotFoundException('egress-connection-not-found');
    const provider = lookupOAuthProvider(row.destinationId);
    if (!provider) throw new BadRequestException('oauth-destination-not-oauth:' + row.destinationId);
    const { clientId, clientSecret } = this.oauthAppCredentials(provider);

    const creds = this.openCredentials(row.credentialsEnvelope);
    const refreshToken = creds.refreshToken ?? '';
    const refreshReq = buildRefreshRequest(provider.tokenUrl, { secretInBody: provider.secretInBody }, clientId, clientSecret, refreshToken);
    if (!refreshReq.ok) throw new BadRequestException(refreshReq.reason);

    const target = normalizeTarget(refreshReq.value.url);
    if (!target.ok) throw new BadRequestException(target.reason);

    const headers: Record<string, string> = {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    };
    if (refreshReq.value.basicAuth) {
      headers['authorization'] =
        'Basic ' + Buffer.from(refreshReq.value.basicAuth.username + ':' + refreshReq.value.basicAuth.password).toString('base64');
    }
    const params = new URLSearchParams(refreshReq.value.body).toString();

    let payload: unknown = null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OAUTH_EXCHANGE_TIMEOUT_MS);
      const response = await fetch(target.value.origin + target.value.path, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: params,
      });
      clearTimeout(timer);
      const text = (await response.text()).slice(0, MAX_RESPONSE_CHARS);
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    } catch {
      throw new BadRequestException('oauth-refresh-transport-error');
    }

    const parsed = parseTokenResponse(payload, Date.now());
    if (!parsed.ok) throw new BadRequestException(parsed.reason);

    const nextCreds: Record<string, string> = { ...creds, accessToken: parsed.value.accessToken };
    if (parsed.value.refreshToken) nextCreds.refreshToken = parsed.value.refreshToken;
    const validated = validateCredentials(row.destinationId, nextCreds);
    if (!validated.ok) throw new BadRequestException(validated.reason);

    const fingerprints: Record<string, string> = {};
    for (const key of Object.keys(validated.value.credentials)) {
      const digest = createHash('sha256').update(validated.value.credentials[key]).digest('hex');
      const fp = fingerprintHex(digest);
      if (!fp.ok) throw new BadRequestException(fp.reason);
      fingerprints[key] = fp.value.fp;
    }

    row.credentialsEnvelope = this.sealCredentials(validated.value.credentials);
    row.credentialFingerprints = fingerprints;
    row.status = 'connected';
    const saved = await this.connections.save(row);
    return {
      ok: true,
      connectionId: saved.id,
      destinationId: saved.destinationId,
      status: saved.status,
      expiresAt: parsed.value.expiresAtMs ? new Date(parsed.value.expiresAtMs).toISOString() : null,
    };
  }
}
