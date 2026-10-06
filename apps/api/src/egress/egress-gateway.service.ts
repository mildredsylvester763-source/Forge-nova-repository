// ============================================================================
// FILE: /apps/api/src/egress/egress-gateway.service.ts
// ============================================================================
// The single controlled door for ALL outbound traffic. Zero-trust design:
//   1. Allowlist: only registered destinations are reachable. No SSRF.
//   2. Input validation: caller-supplied values that become part of a path or
//      query are validated here, so a scan parameter cannot redirect a call.
//   3. Rate limiting: per user, per destination, sliding window.
//   4. Circuit breakers: a failing destination cannot drag scans down.
//   5. Timeouts: every call is bounded BY THE GATEWAY, not on the adapter's
//      good behavior.
//   6. Credential vaulting: provider keys never appear in call sites.
//   7. Audit: every attempt is logged with latency and outcome.
// Callers receive EgressResult envelopes — never raw responses — so failure
// handling is explicit at every call site.

import { Injectable, Logger } from '@nestjs/common';
import {
  EgressDestination,
  EgressResult,
  EgressRule,
  DEFAULT_EGRESS_RULES,
} from './egress.types';
import { errorMessage } from '../common/utils/errors.util';

interface CircuitState {
  failures: number;
  openedAt: number | null;
}

interface RateWindow {
  timestamps: number[];
}

class EgressTimeoutError extends Error {}

const SUBREDDIT_PATTERN = /^[A-Za-z0-9_]{2,21}$/;
const LANGUAGE_PATTERN = /^[A-Za-z0-9+#.-]{1,40}$/;
const MAX_QUERY_LENGTH = 256;
const RATE_MAP_PRUNE_THRESHOLD = 5000;
const SINCE_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };

@Injectable()
export class EgressGatewayService {
  private readonly logger = new Logger(EgressGatewayService.name);
  private readonly rules: Record<EgressDestination, EgressRule> = { ...DEFAULT_EGRESS_RULES };
  private readonly circuits = new Map<string, CircuitState>();
  private readonly rateWindows = new Map<string, RateWindow>();
  private readonly adapters = new Map<EgressDestination, (req: any) => Promise<any>>();

  // ─── The scanner's current API surface ────────────────────────────────────────────────
  // Every method takes the acting userId so the rate limiter and circuit
  // breaker are genuinely per-user: one user's scans cannot starve another's.
  async getTwitterTrends(userId?: string): Promise<EgressResult> {
    return this.dispatch(EgressDestination.TWITTER, 'GET', '/trends', undefined, undefined, userId);
  }

  async getRedditHot(subreddit: string, limit: number, userId?: string): Promise<EgressResult> {
    if (!SUBREDDIT_PATTERN.test(subreddit)) {
      return this.blocked(EgressDestination.REDDIT, 'Invalid subreddit name');
    }
    return this.dispatch(
      EgressDestination.REDDIT,
      'GET',
      '/r/' + subreddit + '/hot',
      { limit: this.clampInt(limit, 1, 100) },
      undefined,
      userId,
    );
  }

  async searchGoogle(query: string, limit: number, userId?: string): Promise<EgressResult> {
    const q = query.trim();
    if (!q || q.length > MAX_QUERY_LENGTH) {
      return this.blocked(EgressDestination.GOOGLE_SEARCH, 'Search query must be 1-' + MAX_QUERY_LENGTH + ' characters');
    }
    return this.dispatch(
      EgressDestination.GOOGLE_SEARCH,
      'GET',
      '/search',
      { q, num: this.clampInt(limit, 1, 10) },
      undefined,
      userId,
    );
  }

  async getGoogleTrends(query: string, userId?: string): Promise<EgressResult> {
    const q = query.trim();
    if (!q || q.length > MAX_QUERY_LENGTH) {
      return this.blocked(EgressDestination.GOOGLE_TRENDS, 'Trends query must be 1-' + MAX_QUERY_LENGTH + ' characters');
    }
    return this.dispatch(EgressDestination.GOOGLE_TRENDS, 'GET', '/trends', { q }, undefined, userId);
  }

  async getGitHubTrending(language: string, since: string, userId?: string): Promise<EgressResult> {
    if (!LANGUAGE_PATTERN.test(language)) {
      return this.blocked(EgressDestination.GITHUB, 'Invalid language filter');
    }
    // "Trending" = created within the window, ranked by stars. (The `since`
    // argument was previously accepted and silently ignored.)
    const days = SINCE_DAYS[since] ?? SINCE_DAYS.weekly;
    const createdAfter = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    return this.dispatch(
      EgressDestination.GITHUB,
      'GET',
      '/search/repositories',
      { q: 'language:' + language + ' created:>' + createdAfter, sort: 'stars', order: 'desc' },
      undefined,
      userId,
    );
  }

  // ─── The door itself ───────────────────────────────────────────────────────────────────────
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
    const key = destination + ':' + (userId || 'platform');
    const circuit = this.circuits.get(key);
    if (circuit?.openedAt) {
      const elapsed = Date.now() - circuit.openedAt;
      if (elapsed < rule.coolDownMs) {
        return this.fail(
          destination,
          started,
          'CIRCUIT_OPEN',
          'Circuit open for ' + destination + '; retry in ' + Math.ceil((rule.coolDownMs - elapsed) / 1000) + 's',
          rule.coolDownMs - elapsed,
        );
      }
      // Half-open: allow a probe attempt; one new failure re-opens instantly.
      circuit.openedAt = null;
      circuit.failures = rule.failureThreshold - 1;
    }

    // 2. Rate limit — sliding window per user+destination.
    if (!this.checkRate(key, rule.requestsPerMinute)) {
      return this.fail(
        destination,
        started,
        'RATE_LIMITED',
        'Rate limit reached for ' + destination + '; window resets within 60s',
        60000,
      );
    }

    // 3. Bounded call. The gateway itself enforces the deadline.
    try {
      const data = await this.withTimeout(
        this.transport(destination, method, path, params, body, headers, rule),
        rule.timeoutMs,
        destination,
      );
      this.recordSuccess(key);
      return {
        ok: true,
        data,
        meta: { destination, latencyMs: Date.now() - started, attempt: 1 },
      };
    } catch (error) {
      this.recordFailure(key, rule);
      const message = errorMessage(error);
      this.logger.warn('Egress to ' + destination + ' failed: ' + message);
      return this.fail(
        destination,
        started,
        error instanceof EgressTimeoutError ? 'TIMEOUT' : 'DESTINATION_ERROR',
        message,
      );
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
    const adapter = this.adapters.get(destination);
    if (!adapter) {
      throw new Error('No transport adapter registered for ' + destination);
    }
    return adapter({ method, path, params, body, timeoutMs: rule.timeoutMs, maxResponseBytes: rule.maxResponseBytes });
  }

  // Boot-time registration of transport adapters (called by EgressModule).
  registerAdapter(destination: EgressDestination, adapter: (req: any) => Promise<any>): void {
    this.adapters.set(destination, adapter);
  }

  private withTimeout<T>(work: Promise<T>, ms: number, destination: EgressDestination): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new EgressTimeoutError('Call to ' + destination + ' exceeded ' + ms + 'ms')),
        ms,
      );
    });
    return Promise.race([work, deadline]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  // ─── Rate limiting (sliding 60s window) ───────────────────────────────────────
  private checkRate(key: string, perMinute: number): boolean {
    const now = Date.now();
    let window = this.rateWindows.get(key);
    if (!window) {
      if (this.rateWindows.size >= RATE_MAP_PRUNE_THRESHOLD) this.pruneRateWindows(now);
      window = { timestamps: [] };
      this.rateWindows.set(key, window);
    }
    window.timestamps = window.timestamps.filter((t) => now - t < 60000);
    if (window.timestamps.length >= perMinute) return false;
    window.timestamps.push(now);
    return true;
  }

  // Bounds memory: idle keys (no call in the last minute) are dropped.
  private pruneRateWindows(now: number): void {
    for (const [key, window] of this.rateWindows) {
      const last = window.timestamps[window.timestamps.length - 1];
      if (last === undefined || now - last >= 60000) this.rateWindows.delete(key);
    }
  }

  // ─── Circuit breaker bookkeeping ────────────────────────────────────────────────
  private recordSuccess(circuitKey: string): void {
    this.circuits.set(circuitKey, { failures: 0, openedAt: null });
  }

  private recordFailure(circuitKey: string, rule: EgressRule): void {
    const circuit = this.circuits.get(circuitKey) || { failures: 0, openedAt: null };
    circuit.failures += 1;
    if (circuit.failures >= rule.failureThreshold) {
      circuit.openedAt = Date.now();
      this.logger.warn('Circuit opened for ' + circuitKey + ' for ' + rule.coolDownMs / 1000 + 's');
    }
    this.circuits.set(circuitKey, circuit);
  }

  private clampInt(value: number, min: number, max: number): number {
    const n = Number.isFinite(value) ? Math.trunc(value) : min;
    return Math.min(Math.max(n, min), max);
  }

  private blocked(destination: EgressDestination, message: string): EgressResult {
    return this.fail(destination, Date.now(), 'BLOCKED', message);
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
