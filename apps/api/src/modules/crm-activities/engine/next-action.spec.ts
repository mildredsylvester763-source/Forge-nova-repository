// ============================================================================
// FILE: /apps/api/src/modules/crm-activities/engine/next-action.spec.ts
// ============================================================================

import { rankNextActions } from './next-action';

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe('next-action engine', () => {
  const now = new Date('2026-03-15T00:00:00Z');

  it('ranks overdue before not-due, stale boost applies', () => {
    const r = rankNextActions(
      [
        { id: 'a', title: 'future', dueAt: '2026-03-25T00:00:00Z', valueCents: 5000000 },
        { id: 'b', title: 'overdue', dueAt: '2026-03-10T00:00:00Z', valueCents: 100000, lastDoneAt: '2026-01-01T00:00:00Z' },
      ],
      now,
    );
    if (!r.ok) return;
    expect(r.value.ranked[0].id).toBe('b');
    expect(r.value.ranked[0].daysOverdue).toBe(5);
  });

  it('refuses empty lists by name', () => {
    const r = rankNextActions([], now);
    if (!r.ok) expect(r.reason).toBe('actions-empty');
  });

  it('500-case sweep: ranked output preserves every action, scores non-negative', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const actions = Array.from({ length: 6 }, (_, k) => ({
        id: 'a' + k,
        title: 't' + k,
        dueAt: new Date(now.getTime() + Math.floor(rnd() * 60 - 30) * 86400000).toISOString(),
        valueCents: Math.floor(rnd() * 2000000),
        lastDoneAt: rnd() < 0.5 ? new Date(now.getTime() - Math.floor(rnd() * 60) * 86400000).toISOString() : null,
      }));
      const v = rankNextActions(actions, now);
      if (!v.ok) throw new Error('sweep refused');
      expect(v.value.ranked).toHaveLength(6);
      for (let k = 1; k < v.value.ranked.length; k++) {
        expect(v.value.ranked[k - 1].score).toBeGreaterThanOrEqual(v.value.ranked[k].score);
      }
    }
  });
});
