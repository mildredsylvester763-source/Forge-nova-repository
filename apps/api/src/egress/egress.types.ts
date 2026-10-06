// ============================================================================
// FILE: /apps/api/src/egress/egress.types.ts
// ============================================================================
// The zero-trust egress vocabulary. Every outbound call Forge Nova makes
// goes through the EgressGateway — there is no direct fetch/axios anywhere
// else in the codebase. This file defines what "going through the door"
// means: destinations, budget rules, and result envelopes.

export enum EgressDestination {
  TWITTER = 'twitter',
  REDDIT = 'reddit',
  GOOGLE_SEARCH = 'google_search',
  GOOGLE_TRENDS = 'google_trends',
  GITHUB = 'github',
  HTTP = 'http',            // generic REST custom connector
  DATABASE = 'database',    // user-connected databases
  MCP = 'mcp',              // Model Context Protocol servers
}

export interface EgressRule {
  destination: EgressDestination;
  // Requests per minute allowed to this destination (per user).
  requestsPerMinute: number;
  // Hard timeout — no call may hang the scan loop.
  timeoutMs: number;
  // Circuit breaker: after this many consecutive failures, open the circuit
  // for coolDownMs before allowing another attempt.
  failureThreshold: number;
  coolDownMs: number;
  // Optional response size ceiling (bytes) to bound memory.
  maxResponseBytes?: number;
}

// Default rules: conservative. Overridden per environment via config.
export const DEFAULT_EGRESS_RULES: Record<EgressDestination, EgressRule> = {
  [EgressDestination.TWITTER]: { destination: EgressDestination.TWITTER, requestsPerMinute: 60, timeoutMs: 10000, failureThreshold: 5, coolDownMs: 60000, maxResponseBytes: 5 * 1024 * 1024 },
  [EgressDestination.REDDIT]: { destination: EgressDestination.REDDIT, requestsPerMinute: 60, timeoutMs: 10000, failureThreshold: 5, coolDownMs: 60000, maxResponseBytes: 5 * 1024 * 1024 },
  [EgressDestination.GOOGLE_SEARCH]: { destination: EgressDestination.GOOGLE_SEARCH, requestsPerMinute: 30, timeoutMs: 10000, failureThreshold: 4, coolDownMs: 120000, maxResponseBytes: 2 * 1024 * 1024 },
  [EgressDestination.GOOGLE_TRENDS]: { destination: EgressDestination.GOOGLE_TRENDS, requestsPerMinute: 30, timeoutMs: 10000, failureThreshold: 4, coolDownMs: 120000, maxResponseBytes: 2 * 1024 * 1024 },
  [EgressDestination.GITHUB]: { destination: EgressDestination.GITHUB, requestsPerMinute: 90, timeoutMs: 10000, failureThreshold: 6, coolDownMs: 60000, maxResponseBytes: 10 * 1024 * 1024 },
  [EgressDestination.HTTP]: { destination: EgressDestination.HTTP, requestsPerMinute: 30, timeoutMs: 15000, failureThreshold: 4, coolDownMs: 60000, maxResponseBytes: 2 * 1024 * 1024 },
  [EgressDestination.DATABASE]: { destination: EgressDestination.DATABASE, requestsPerMinute: 20, timeoutMs: 20000, failureThreshold: 3, coolDownMs: 120000, maxResponseBytes: 10 * 1024 * 1024 },
  [EgressDestination.MCP]: { destination: EgressDestination.MCP, requestsPerMinute: 30, timeoutMs: 15000, failureThreshold: 4, coolDownMs: 60000, maxResponseBytes: 5 * 1024 * 1024 },
};

export interface EgressResult<T = any> {
  ok: boolean;
  data?: T;
  error?: {
    code: 'RATE_LIMITED' | 'CIRCUIT_OPEN' | 'TIMEOUT' | 'DESTINATION_ERROR' | 'BLOCKED';
    message: string;
    retryAfterMs?: number;
  };
  // Observability — feeds scan performance metrics and audit logs.
  meta: {
    destination: EgressDestination;
    latencyMs: number;
    attempt: number;
  };
}

export enum EgressCredentialType {
  PLATFORM = 'platform',    // Forge Nova's own key (rare, deliberate)
  USER_OAUTH = 'user_oauth', // user connected their account via OAuth
  USER_API_KEY = 'user_api_key', // BYOK — user's own key, encrypted at rest
}
