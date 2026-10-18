import {
  buildInventoryReport,
  buildStatusReport,
  SYSTEM_MODULES,
} from './system-inventory';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('engine/system-inventory (deployment manifest and health)', () => {
  it('builds an inventory report from validated counts', () => {
    const r = buildInventoryReport({ connections: 3, destinationsOffered: 888, callLogs: 42, oauthProviders: 25 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.counts.destinationsOffered).toBe(888);
      expect(r.value.counts.connections).toBe(3);
      expect(r.value.modules.length).toBe(SYSTEM_MODULES.length);
    }
  });

  it('refuses malformed counts by name', () => {
    expect(buildInventoryReport(null as unknown as Record<string, unknown>).ok).toBe(false);
    expect(buildInventoryReport({ connections: -1, destinationsOffered: 888, callLogs: 0, oauthProviders: 25 }).ok).toBe(false);
    expect(buildInventoryReport({ connections: 1.5, destinationsOffered: 888, callLogs: 0, oauthProviders: 25 }).ok).toBe(false);
    expect(buildInventoryReport({ destinationsOffered: 888, callLogs: 0, oauthProviders: 25 }).ok).toBe(false);
    const bad = buildInventoryReport({ connections: 'x', destinationsOffered: 888, callLogs: 0, oauthProviders: 25 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('system-invalid-count:connections');
  });

  it('derives health from the database, never asserts it', () => {
    const up = buildStatusReport(true, '1.0.0');
    expect(up.ok).toBe(true);
    if (up.ok) {
      expect(up.value.status).toBe('ok');
      expect(up.value.database).toBe('up');
      expect(up.value.notes).toHaveLength(0);
    }
    const down = buildStatusReport(false, '1.0.0');
    expect(down.ok).toBe(true);
    if (down.ok) {
      expect(down.value.status).toBe('degraded');
      expect(down.value.database).toBe('down');
      expect(down.value.notes[0]).toContain('database unreachable');
    }
    expect(buildStatusReport(true, '').ok).toBe(false);
    expect(buildStatusReport(true, 5 as unknown as string).ok).toBe(false);
  });

  it('mulberry32 500-case sweep (seed 42): any valid counts build a report', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const counts = {
        connections: Math.floor(rnd() * 10000),
        destinationsOffered: Math.floor(rnd() * 10000),
        callLogs: Math.floor(rnd() * 100000),
        oauthProviders: Math.floor(rnd() * 100),
      };
      const r = buildInventoryReport(counts);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.value.counts.connections).toBe(counts.connections);
      expect(r.value.modules).toHaveLength(SYSTEM_MODULES.length);
    }
  });
});
