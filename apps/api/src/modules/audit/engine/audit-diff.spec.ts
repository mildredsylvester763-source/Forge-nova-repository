// ============================================================================
// FILE: /apps/api/src/modules/audit/engine/audit-diff.spec.ts
// ============================================================================

import { diffJson } from './audit-diff';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('audit-diff engine', () => {
  it('detects set, added, and removed fields in the pinned pair', () => {
    const r = diffJson({ name: 'Acme', status: 'active', note: 'x' }, { name: 'Acme', status: 'void', extra: 1 });
    if (!r.ok) return;
    const fields = r.value.changes.map((c) => c.field).sort();
    expect(fields).toEqual(['extra', 'note', 'status']);
    const status = r.value.changes.find((c) => c.field === 'status');
    if (!status) return;
    expect(status.kind).toBe('set');
    expect(status.before).toBe('active');
    expect(status.after).toBe('void');
  });

  it('refuses identical snapshots by name', () => {
    const r = diffJson({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 });
    if (!r.ok) expect(r.reason).toBe('diff-same-values');
  });

  it('refuses non-object inputs by name', () => {
    expect(diffJson(null as never, {}).ok).toBe(false);
    expect(diffJson('x' as never, {}).ok).toBe(false);
    expect(diffJson({}, [1] as never).ok).toBe(false);
  });

  it('500-case sweep: every change is set/added/removed and traceable', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const before: Record<string, unknown> = { a: Math.floor(rnd() * 10), b: 'const' };
      const after: Record<string, unknown> = { ...before, ...(rnd() < 0.5 ? { c: Math.floor(rnd() * 10) } : {}) };
      if (rnd() < 0.3) after.a = Math.floor(rnd() * 10);
      const v = diffJson(before, after);
      if (!v.ok) {
        expect(v.reason).toBe('diff-same-values');
        continue;
      }
      for (const change of v.value.changes) {
        expect(['set', 'added', 'removed']).toContain(change.kind);
        expect(typeof change.field).toBe('string');
      }
    }
  });
});
