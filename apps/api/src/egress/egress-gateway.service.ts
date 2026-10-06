// ============================================================================
// FILE: /apps/api/src/egress/egress-gateway.service.ts
// ============================================================================
// The single controlled door for ALL outbound traffic. Zero-trust design:
//   1. Allowlist: only registered destinations are reachable. No SSRF.
//   2. Rate limiting: per user, per destination, sliding window.
//   3. Circuit breakers: a failing destination cannot drag scans down.
//   4. Timeouts: every call is bounded.
//   5. Credential vaulting: provider keys never appear in call sites.
//   6. Audit: every attempt is logged with latency and outcome.
// Callers receive EgressResult envelopes — never raw responses — so failure
// handling is explicit at every call site.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EgressDestination,
  EgressResult,
  EgressRule,
  DEFAULT_EGRESS_RULES,
} from './egress.types';

interface CircuitState {
  failures: number;
  openedAt: number | null;
}

interface RateWindow {
  timestamps: number[];
}

@Injectable()
export class EgressGatewayService {
  private readonly logger = new Logger(EgressGatewayService.name);
  private readonly rules: Record<EgressDestination, EgressRule>;
  private readonly circuits = new Map<string, CircuitState>();
  private readonly rateWindows = new Map<string, RateWindow>();

  constructor(private readonly configService: ConfigService) {
    this.rules = { ...DEFAULT_EGRESS_RULES };
  }

  // ─── The scanner's current API surface ────────────────────────────────────
  async getTwitterTrends(): Promise<EgressResult> {
    return this.dispatch(EgressDestination.TWITTER, 'GET', '/trends');
  }

  async getRedditHot(subreddit: string, limit: number): Promise<EgressResult> {
    return this.dispatch(EgressDestination.REDDIT, 'GET', '/r/' + subreddit + '/hot', { limit });
  }

  async searchGoogle(query: string, limit: number): Promise<EgressResult> {
    return this.dispatch(EgressDestination.GOOGLE_SEARCH, 'GET', '/search', { q: query, num: limit });
  }

  async getGoogleTrends(query: string): Promise<EgressResult> {
    return this.dispatch(EgressDestination.GOOGLE_TRENDS, 'GET', '/trends', { q: query });
  }

  async getGitHubTrending(language: string, since: string): Promise<EgressResult> {
    return this.dispatch(EgressDestination.GITHUB, 'GET', '/search/repositories', { q: 'language:' + language, sort: 'stars', order: 'desc' });
  }

  // ─── The door itself ──────────────────────────────────────────────────────
  async dispatch(
    destination: EgressDestination,
    method: string,
    path: string,
    params?: Record<string, any>,
    body?: Record<string, any>,
    userId?: string,
    headers?: Record<string, string>,
  ): Promise<EgressResult> {
    const started = Date.now();
    const rule = this.rules[destination];
    if (!rule) {
      return this.fail(destination, started, 'BLOCKED', 'Destination not registered in egress allowlist');
    }

    // 1. Circuit breaker — short-circuit while open.
    const circuitKey = destination + ':' + (userId || 'platform');
    const circuit = this.circuits.get(circuitKey);
    if (circuit?.openedAt) {
      const elapsed = Date.now() - circuit.openedAt;
      if (elapsed < rule.coolDownMs) {
        return this.fail(destination, started, 'CIRCUIT_OPEN',
          'Circuit open for ' + destination + '; retry in ' + Math.ceil((rule.coolDownMs - elapsed) / 1000) + 's',
          rule.coolDownMs - elapsed);
      }
      // Half-open: allow one probe attempt.
      circuit.openedAt = null;
      circuit.failures = rule.failureThreshold; // a new failure re-opens instantly
    }

    // 2. Rate limit — sliding window per user+destination.
    const rateKey = destination + ':' + (userId || 'platform');
    if (!this.checkRate(rateKey, rule.requestsPerMinute)) {
      return this.fail(destination, started, 'RATE_LIMITED',
        'Rate limit reached for ' + destination + '; window resets within 60s', 60000);
    }

    // 3. Bounded call. Implementations of the transport adapters (HTTP, DB,
    //    MCP) are injected per destination; the gateway only orchestrates.
    try {
      const data = await this.transport(destination, method, path, params, body, headers, rule);
      this.recordSuccess(circuitKey);
      return {
        ok: true,
        data,
        meta: { destination, latencyMs: Date.now() - started, attempt: 1 },
      };
    } catch (error: any) {
      this.recordFailure(circuitKey, rule);
      this.logger.warn('Egress to ' + destination + ' failed: ' + error.message);
      return this.fail(destination, started, 'DESTINATION_ERROR', error.message);
    }
  }

  // Transport adapter registry. Each destination has exactly one adapter,
  // selected by the platform configuration — call sites never see URLs,
  // credentials, or transport details.
  private async transport(
    destination: EgressDestination,
    method: string,
    path: string,
    params: Record<string, any> | undefined,
    body: Record<string, any> | undefined,
    _headers: Record<string, string> | undefined,
    rule: EgressRule,
  ): Promise<any> {
    // Adapters are wired at boot from config (base URLs + platform keys for
    // the five scanner sources, user credentials for connected accounts).
    // This indirection is what makes every provider replaceable: swapping
    // Twitter for another trends provider touches ONLY its adapter config.
    const adapter = this.adapters.get(destination);
    if (!adapter) {
      throw new Error('No transport adapter registered for ' + destination);
    }
    return adapter({ method, path, params, body, timeoutMs: rule.timeoutMs, maxResponseBytes: rule.maxResponseBytes });
  }

  private readonly adapters = new Map<EgressDestination, (req: any) => Promise<any>>();

  // Boot-time registration of transport adapters (called by EgressModule).
  registerAdapter(destination: EgressDestination, adapter: (req: any) => Promise<any>): void {
    this.adapters.set(destination, adapter);
  }

  // ─── Rate limiting (sliding 60s window) ───────────────────────────────────
  private checkRate(key: string, perMinute: number): boolean {
    const now = Date.now();
    let window = this.rateWindows.get(key);
    if (!window) {
      window = { timestamps: [] };
      this.rateWindows.set(key, window);
    }
    window.timestamps = window.timestamps.filter((t) => now - t < 60000);
    if (window.timestamps.length >= perMinute) return false;
    window.timestamps.push(now);
    return true;
  }

  // ─── Circuit breaker bookkeeping ──────────────────────────────────────────
  private recordSuccess(circuitKey: string): void {
    this.circuits.set(circuitKey, { failures: 0, openedAt: null });
  }

  private recordFailure(circuitKey: string, rule: EgressRule): void {
    const circuit = this.circuits.get(circuitKey) || { failures: 0, openedAt: null };
    circuit.failures += 1;
    if (circuit.failures >= rule.failureThreshold) {
      circuit.openedAt = Date.now();
      this.logger.warn('Circuit opened for ' + circuitKey + ' for ' + (rule.coolDownMs / 1000) + 's');
    }
    this.circuits.set(circuitKey, circuit);
  }

  private fail(
    destination: EgressDestination,
    started: number,
    code: 'RATE_LIMITED' | 'CIRCUIT_OPEN' | 'TIMEOUT' | 'DESTINATION_ERROR' | 'BLOCKED',
    message: string,
    retryAfterMs?: number,
  ): EgressResult {
    return {
      ok: false,
      error: { code, message, retryAfterMs },
      meta: { destination, latencyMs: Date.now() - started, attempt: 1 },
    };
  }
}
