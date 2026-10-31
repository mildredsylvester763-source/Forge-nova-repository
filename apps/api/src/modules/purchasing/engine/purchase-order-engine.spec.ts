import {
  aggregatePoStatus,
  canCancelPo,
  canSendPo,
  planPurchaseOrder,
  receivePoLine,
  validatePoQty,
  validatePoSku,
} from './purchase-order-engine';

const DAY_MS = 24 * 3600 * 1000;

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

describe('purchase-order-engine (pinned vectors)', () => {
  it('trims SKUs and refuses empty or oversized ones', () => {
    expect(validatePoSku('  SKU-1  ')).toEqual({ ok: true, value: 'SKU-1' });
    expect(validatePoSku('   ')).toEqual({ ok: false, reason: 'po-invalid-sku' });
    expect(validatePoSku('x'.repeat(65))).toEqual({ ok: false, reason: 'po-invalid-sku' });
  });

  it('only accepts whole positive quantities within range', () => {
    expect(validatePoQty(5)).toEqual({ ok: true, value: 5 });
    expect(validatePoQty(0)).toEqual({ ok: false, reason: 'po-invalid-qty' });
    expect(validatePoQty(-1)).toEqual({ ok: false, reason: 'po-invalid-qty' });
    expect(validatePoQty(2.5)).toEqual({ ok: false, reason: 'po-invalid-qty' });
    expect(validatePoQty(1000001)).toEqual({ ok: false, reason: 'po-invalid-qty' });
  });

  it('plans a draft with line totals, order total and expected date', () => {
    const plan = planPurchaseOrder(7, 1700000000000, [
      { sku: 'SKU-1', qty: 5, unitCostCents: 200 },
      { sku: 'SKU-2', qty: 3, unitCostCents: 100 },
    ]);
    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error('expected success');
    expect(plan.value.totalCents).toBe(1300);
    expect(plan.value.lines).toHaveLength(2);
    expect(plan.value.lines[0].lineTotalCents).toBe(1000);
    expect(plan.value.expectedAtMs).toBe(1700000000000 + 7 * DAY_MS);
  });

  it('refuses empty orders, duplicates and broken lines by name', () => {
    expect(planPurchaseOrder(0, 1, [])).toEqual({ ok: false, reason: 'po-empty' });
    expect(
      planPurchaseOrder(0, 1, [
        { sku: 'A', qty: 1, unitCostCents: 0 },
        { sku: 'A', qty: 2, unitCostCents: 0 },
      ]),
    ).toEqual({ ok: false, reason: 'po-duplicate-sku' });
    expect(
      planPurchaseOrder(0, 1, [
        { sku: ' A ', qty: 1, unitCostCents: 0 },
        { sku: 'A', qty: 2, unitCostCents: 0 },
      ]),
    ).toEqual({ ok: false, reason: 'po-duplicate-sku' });
    expect(planPurchaseOrder(0, 1, [{ sku: 'A', qty: 0, unitCostCents: 0 }])).toEqual({
      ok: false,
      reason: 'po-invalid-qty',
    });
    expect(planPurchaseOrder(400, 1, [{ sku: 'A', qty: 1, unitCostCents: 0 }])).toEqual({
      ok: false,
      reason: 'po-invalid-lead-time',
    });
  });

  it('only a draft can be sent', () => {
    expect(canSendPo('draft')).toEqual({ ok: true, value: true });
    expect(canSendPo('sent')).toEqual({ ok: false, reason: 'po-invalid-transition' });
    expect(canSendPo('cancelled')).toEqual({ ok: false, reason: 'po-invalid-transition' });
  });

  it('cancels drafts and clean sent orders, refuses everything with receipts', () => {
    expect(canCancelPo('draft', 0)).toEqual({ ok: true, value: true });
    expect(canCancelPo('sent', 0)).toEqual({ ok: true, value: true });
    expect(canCancelPo('sent', 3)).toEqual({ ok: false, reason: 'po-cancel-after-receipt' });
    expect(canCancelPo('partially-received', 5)).toEqual({
      ok: false,
      reason: 'po-cancel-after-receipt',
    });
    expect(canCancelPo('received', 8)).toEqual({ ok: false, reason: 'po-invalid-transition' });
    expect(canCancelPo('cancelled', 0)).toEqual({ ok: false, reason: 'po-invalid-transition' });
  });

  it('receives against open lines and refuses every abuse by name', () => {
    expect(receivePoLine('draft', 10, 0, 5)).toEqual({ ok: false, reason: 'po-status-not-receivable' });
    expect(receivePoLine('cancelled', 10, 0, 5)).toEqual({ ok: false, reason: 'po-cancelled' });
    expect(receivePoLine('received', 10, 10, 1)).toEqual({
      ok: false,
      reason: 'po-status-not-receivable',
    });
    expect(receivePoLine('sent', 10, 8, 3)).toEqual({ ok: false, reason: 'po-over-receive' });
    const partial = receivePoLine('sent', 10, 0, 4);
    expect(partial.ok).toBe(true);
    if (!partial.ok) throw new Error('expected success');
    expect(partial.value).toEqual({ newReceivedQty: 4, statusAfter: 'partially-received' });
    const done = receivePoLine('partially-received', 10, 4, 6);
    expect(done.ok).toBe(true);
    if (!done.ok) throw new Error('expected success');
    expect(done.value).toEqual({ newReceivedQty: 10, statusAfter: 'received' });
    expect(receivePoLine('partially-received', 10, 10, 1)).toEqual({
      ok: false,
      reason: 'po-already-received',
    });
  });

  it('aggregates the order status across every line', () => {
    expect(aggregatePoStatus([{ qty: 5, receivedQty: 5 }, { qty: 3, receivedQty: 0 }])).toEqual({
      ok: true,
      value: 'partially-received',
    });
    expect(aggregatePoStatus([{ qty: 5, receivedQty: 5 }, { qty: 3, receivedQty: 3 }])).toEqual({
      ok: true,
      value: 'received',
    });
    expect(aggregatePoStatus([])).toEqual({ ok: false, reason: 'po-invalid-state' });
    expect(aggregatePoStatus([{ qty: 5, receivedQty: 6 }])).toEqual({
      ok: false,
      reason: 'po-invalid-state',
    });
  });
});

describe('purchase-order-engine (500-case sweep, seed 42)', () => {
  it('plan totals are exact and duplicates are refused', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(rng() * 5);
      const lines: Array<{ sku: string; qty: number; unitCostCents: number }> = [];
      let expectedTotal = 0;
      let dup = false;
      const seen = new Set<string>();
      for (let j = 0; j < n; j++) {
        const sku = 'S' + Math.floor(rng() * 4);
        const qty = 1 + Math.floor(rng() * 10);
        const cost = Math.floor(rng() * 500);
        if (seen.has(sku)) dup = true;
        seen.add(sku);
        lines.push({ sku, qty, unitCostCents: cost });
        expectedTotal += qty * cost;
      }
      const verdict = planPurchaseOrder(3, 1700000000000, lines);
      if (dup) {
        expect(verdict).toEqual({ ok: false, reason: 'po-duplicate-sku' });
      } else {
        if (!verdict.ok) throw new Error('expected success');
        expect(verdict.value.totalCents).toBe(expectedTotal);
        expect(verdict.value.expectedAtMs).toBe(1700000000000 + 3 * DAY_MS);
      }
    }
  });

  it('receipt rules hold for random states', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const roll = rng();
      const status =
        roll < 0.25 ? 'draft' : roll < 0.5 ? 'sent' : roll < 0.75 ? 'partially-received' : 'cancelled';
      const ordered = 1 + Math.floor(rng() * 20);
      const already = Math.floor(rng() * 25);
      const qty = 1 + Math.floor(rng() * 20);
      const verdict = receivePoLine(status, ordered, already, qty);
      if (status === 'cancelled') {
        expect(verdict).toEqual({ ok: false, reason: 'po-cancelled' });
      } else if (status === 'draft') {
        expect(verdict).toEqual({ ok: false, reason: 'po-status-not-receivable' });
      } else if (already >= ordered) {
        expect(verdict).toEqual({ ok: false, reason: 'po-already-received' });
      } else if (already + qty > ordered) {
        expect(verdict).toEqual({ ok: false, reason: 'po-over-receive' });
      } else {
        if (!verdict.ok) throw new Error('expected success');
        expect(verdict.value.newReceivedQty).toBe(already + qty);
        expect(verdict.value.statusAfter).toBe(
          already + qty === ordered ? 'received' : 'partially-received',
        );
      }
    }
  });

  it('cancellation rules hold for random states', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const status = (['draft', 'sent', 'partially-received', 'received', 'cancelled'] as const)[
        Math.floor(rng() * 5)
      ];
      const receivedTotal = Math.floor(rng() * 10);
      const verdict = canCancelPo(status, receivedTotal);
      if (status === 'draft') {
        expect(verdict.ok).toBe(true);
      } else if (status === 'sent') {
        expect(verdict.ok).toBe(receivedTotal === 0);
        if (receivedTotal > 0) expect(verdict).toEqual({ ok: false, reason: 'po-cancel-after-receipt' });
      } else {
        expect(verdict.ok).toBe(false);
      }
    }
  });
});
