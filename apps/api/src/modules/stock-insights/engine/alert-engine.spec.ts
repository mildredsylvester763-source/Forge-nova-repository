import {
  isLowStock,
  planLowStockScan,
  reorderThreshold,
  validateAlertParam,
} from './alert-engine';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('alert-engine (pinned vectors)', () => {
  it('validates parameters by name, with vectors at the caps', () => {
    expect(validateAlertParam(0, 'alert-invalid-demand')).toEqual({ ok: true, value: 0 });
    expect(validateAlertParam(1000000, 'alert-invalid-demand')).toEqual({ ok: true, value: 1000000 });
    expect(validateAlertParam(1000001, 'alert-invalid-demand')).toEqual({
      ok: false,
      reason: 'alert-invalid-demand',
    });
    expect(validateAlertParam(-1, 'alert-invalid-demand')).toEqual({
      ok: false,
      reason: 'alert-invalid-demand',
    });
    expect(validateAlertParam(2.5, 'alert-invalid-demand')).toEqual({
      ok: false,
      reason: 'alert-invalid-demand',
    });
  });

  it('computes reorder thresholds including the cap boundary', () => {
    expect(reorderThreshold(2, 3, 4)).toEqual({ ok: true, value: 10 });
    expect(reorderThreshold(10000, 1000, 0)).toEqual({ ok: true, value: 10000000 });
    expect(reorderThreshold(10001, 1000, 0)).toEqual({ ok: false, reason: 'alert-threshold-too-large' });
    expect(reorderThreshold(0, 0, 0)).toEqual({ ok: true, value: 0 });
    expect(reorderThreshold('2', 3, 4)).toEqual({ ok: false, reason: 'alert-invalid-demand' });
    expect(reorderThreshold(2, '3', 4)).toEqual({ ok: false, reason: 'alert-invalid-lead-time' });
    expect(reorderThreshold(2, 3, -1)).toEqual({ ok: false, reason: 'alert-invalid-safety-stock' });
  });

  it('flags low stock exactly, including stock-outs and unconfigured items', () => {
    expect(isLowStock(5, 10)).toBe(true);
    expect(isLowStock(10, 10)).toBe(true);
    expect(isLowStock(11, 10)).toBe(false);
    expect(isLowStock(0, 0)).toBe(false);
    expect(isLowStock(0, 10)).toBe(true);
  });

  it('plans scans: new alerts, recoveries, still-low and skips', () => {
    const items = [
      { itemId: 'lowNew', onHand: 2, dailyDemand: 3, leadTimeDays: 2, safetyStock: 5 },
      { itemId: 'lowActive', onHand: 1, dailyDemand: 1, leadTimeDays: 1, safetyStock: 5 },
      { itemId: 'recovered', onHand: 50, dailyDemand: 1, leadTimeDays: 1, safetyStock: 5 },
      { itemId: 'noParams', onHand: 0, dailyDemand: 0, leadTimeDays: 0, safetyStock: 0 },
      { itemId: 'okItem', onHand: 99, dailyDemand: 1, leadTimeDays: 1, safetyStock: 1 },
    ];
    expect(planLowStockScan(items, ['lowActive', 'recovered'])).toEqual({
      toAlert: [{ itemId: 'lowNew', onHand: 2, threshold: 11 }],
      toResolveItemIds: ['recovered'],
      stillLowItemIds: ['lowActive'],
      skippedItemIds: ['noParams'],
    });
    const afterAlert = planLowStockScan(items, ['lowNew', 'lowActive', 'recovered']);
    expect(afterAlert.toAlert).toEqual([]);
    expect(afterAlert.stillLowItemIds).toEqual(['lowNew', 'lowActive']);
  });
});

describe('alert-engine (500-case sweep, seed 42)', () => {
  it('thresholds match direct multiplication with the cap rule', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const d = Math.floor(rng() * 4);
      const l = Math.floor(rng() * 4);
      const s = Math.floor(rng() * 9);
      const verdict = reorderThreshold(d, l, s);
      const expected = d * l + s;
      if (expected > 10000000) {
        expect(verdict).toEqual({ ok: false, reason: 'alert-threshold-too-large' });
      } else {
        expect(verdict).toEqual({ ok: true, value: expected });
      }
    }
  });

  it('scan plans match an independent re-derivation', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(rng() * 6);
      const items: Array<{
        itemId: string;
        onHand: number;
        dailyDemand: number;
        leadTimeDays: number;
        safetyStock: number;
      }> = [];
      for (let j = 0; j < n; j++) {
        items.push({
          itemId: 'i' + j,
          onHand: Math.floor(rng() * 30),
          dailyDemand: Math.floor(rng() * 5),
          leadTimeDays: Math.floor(rng() * 5),
          safetyStock: Math.floor(rng() * 8),
        });
      }
      const active = items.filter(() => rng() < 0.4).map((x) => x.itemId);
      const plan = planLowStockScan(items, active);
      const expectedAlert: Array<{ itemId: string; onHand: number; threshold: number }> = [];
      const expectedResolve: string[] = [];
      const expectedStill: string[] = [];
      const expectedSkip: string[] = [];
      for (const it of items) {
        const t = it.dailyDemand * it.leadTimeDays + it.safetyStock;
        if (!(Number.isInteger(t) && t > 0 && t <= 10000000)) {
          expectedSkip.push(it.itemId);
          continue;
        }
        const low = it.onHand <= t;
        const isActive = active.indexOf(it.itemId) !== -1;
        if (low && isActive) {
          expectedStill.push(it.itemId);
        } else if (low && !isActive) {
          expectedAlert.push({ itemId: it.itemId, onHand: it.onHand, threshold: t });
        } else if (!low && isActive) {
          expectedResolve.push(it.itemId);
        }
      }
      expect(plan.toAlert).toEqual(expectedAlert);
      expect(plan.toResolveItemIds).toEqual(expectedResolve);
      expect(plan.stillLowItemIds).toEqual(expectedStill);
      expect(plan.skippedItemIds).toEqual(expectedSkip);
    }
  });
});
