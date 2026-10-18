// ============================================================================
// FILE: /apps/api/src/modules/system/engine/system-inventory.ts
// ============================================================================
// The system plane: one honest picture of what this deployment is and what
// is running inside it. The inventory is PINNED — a module appears here
// because it exists, never because it would be nice to exist. Counts are
// passed in by the service (from the real database); the engine validates
// them and refuses malformed input by name. Pure: no DB, no clock, no env.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface SystemModuleEntry {
  id: string;
  name: string;
  summary: string;
}

// The pinned module inventory. This is the deployment's honest manifest.
export const SYSTEM_MODULES: SystemModuleEntry[] = [
  { id: 'auth', name: 'Auth', summary: 'Identity, sessions, and access' },
  { id: 'egress-universal', name: 'Universal Egress', summary: '888-destination outbound connections, dispatch plane, OAuth tap-to-connect, rate limiting, circuit breaker' },
  { id: 'system', name: 'System', summary: 'Deployment status, deep health, and this inventory' },
];

export function validateCount(raw: unknown, name: string): Verdict<number> {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 1_000_000_000) {
    return { ok: false, reason: 'system-invalid-count:' + name };
  }
  return { ok: true, value: raw };
}

export interface InventoryCounts {
  connections: number;
  destinationsOffered: number;
  callLogs: number;
  oauthProviders: number;
}

export interface InventoryReport {
  modules: SystemModuleEntry[];
  counts: InventoryCounts;
}

export function buildInventoryReport(counts: Record<string, unknown>): Verdict<InventoryReport> {
  if (!counts || typeof counts !== 'object') return { ok: false, reason: 'system-invalid-counts' };
  const keys = ['connections', 'destinationsOffered', 'callLogs', 'oauthProviders'];
  const validated: Record<string, number> = {};
  for (const key of keys) {
    const v = validateCount(counts[key], key);
    if (!v.ok) return v;
    validated[key] = v.value;
  }
  return {
    ok: true,
    value: {
      modules: SYSTEM_MODULES,
      counts: {
        connections: validated.connections,
        destinationsOffered: validated.destinationsOffered,
        callLogs: validated.callLogs,
        oauthProviders: validated.oauthProviders,
      },
    },
  };
}

export interface StatusReport {
  status: 'ok' | 'degraded' | 'down';
  database: 'up' | 'down';
  version: string;
  notes: string[];
}

// Health is derived, never asserted: a down database makes the system
// degraded even if the process itself is alive. No fake green checks.
export function buildStatusReport(
  databaseUp: boolean,
  version: string,
): Verdict<StatusReport> {
  if (typeof version !== 'string' || version.length === 0 || version.length > 32) {
    return { ok: false, reason: 'system-invalid-version' };
  }
  const notes: string[] = [];
  if (!databaseUp) notes.push('database unreachable: queries will fail until it recovers');
  return {
    ok: true,
    value: {
      status: databaseUp ? 'ok' : 'degraded',
      database: databaseUp ? 'up' : 'down',
      version,
      notes,
    },
  };
}
