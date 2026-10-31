import {
  planStockReceipt,
  planStockTransfer,
  validateLocationName,
  validateLocationQty,
  validateStockSku,
} from './location-engine';

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

describe('location-engine (pinned vectors)', () => {
  it('trims location names and refuses empty or oversized ones', () => {
    expect(validateLocationName('  Main Store  ')).toEqual({ ok: true, value: 'Main Store' });
    expect(validateLocationName('   ')).toEqual({ ok: false, reason: 'location-invalid-name' });
    expect(validateLocationName('x'.repeat(81))).toEqual({ ok: false, reason: 'location-invalid-name' });
  });

  it('validates skus and quantities by name', () => {
    expect(validateStockSku('  SKU-1  ')).toEqual({ ok: true, value: 'SKU-1' });
    expect(validateStockSku('   ')).toEqual({ ok: false, reason: 'location-invalid-sku' });
    expect(validateStockSku('x'.repeat(65))).toEqual({ ok: false, reason: 'location-invalid-sku' });
    expect(validateLocationQty(5)).toEqual({ ok: true, value: 5 });
    expect(validateLocationQty(0)).toEqual({ ok: false, reason: 'location-invalid-qty' });
    expect(validateLocationQty(1.5)).toEqual({ ok: false, reason: 'location-invalid-qty' });
    expect(validateLocationQty(1000001)).toEqual({ ok: false, reason: 'location-invalid-qty' });
  });

  it('plans receipts and refuses broken states and oversized totals', () => {
    expect(planStockReceipt(10, 5)).toEqual({ ok: true, value: 15 });
    expect(planStockReceipt(9999999, 1)).toEqual({ ok: false, reason: 'location-stock-too-large' });
    expect(planStockReceipt(-1, 5)).toEqual({ ok: false, reason: 'location-invalid-state' });
    expect(planStockReceipt(10, 0)).toEqual({ ok: false, reason: 'location-invalid-qty' });
  });

  it('plans transfers and refuses uncovered sources by name', () => {
    expect(planStockTransfer(10, 3, 4)).toEqual({ ok: true, value: { newFrom: 6, newTo: 7 } });
    expect(planStockTransfer(3, 3, 4)).toEqual({ ok: false, reason: 'location-insufficient-stock' });
    expect(planStockTransfer(10, 9999999, 1)).toEqual({ ok: false, reason: 'location-stock-too-large' });
    expect(planStockTransfer(10, 3, 0)).toEqual({ ok: false, reason: 'location-invalid-qty' });
  });
});

describe('location-engine (500-case sweep, seed 42)', () => {
  it('name and sku validity follow the trim and length rules exactly', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const len = Math.floor(rng() * 100);
      const pad = rng() < 0.5 ? ' ' : '';
      const raw = pad + 'x'.repeat(len) + pad;
      const name = validateLocationName(raw);
      const trimmed = raw.trim();
      expect(name.ok).toBe(trimmed.length >= 1 && trimmed.length <= 80);
      const sku = validateStockSku(raw);
      expect(sku.ok).toBe(trimmed.length >= 1 && trimmed.length <= 64);
    }
  });

  it('quantity validity follows the integer range rules exactly', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const qty = Math.floor(rng() * 1200000) - 100000 + (rng() < 0.3 ? 0.5 : 0);
      const verdict = validateLocationQty(qty);
      expect(verdict.ok).toBe(Number.isInteger(qty) && qty >= 1 && qty <= 1000000);
    }
  });

  it('receipt planning follows the state and total cap rules exactly', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const cur = Math.floor(rng() * 20000000) - 1000000;
      const qty = Math.floor(rng() * 1200000) - 100000;
      const verdict = planStockReceipt(cur, qty);
      const qtyOk = Number.isInteger(qty) && qty >= 1 && qty <= 1000000;
      const expectOk = qtyOk && Number.isInteger(cur) && cur >= 0 && cur + qty <= 10000000;
      expect(verdict.ok).toBe(expectOk);
      if (expectOk) {
        if (!verdict.ok) throw new Error('expected success');
        expect(verdict.value).toBe(cur + qty);
      }
    }
  });

  it('transfer planning follows the coverage and cap rules exactly', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const from = Math.floor(rng() * 3000000) - 500000;
      const to = Math.floor(rng() * 12000000);
      const qty = Math.floor(rng() * 1200000) - 100000;
      const verdict = planStockTransfer(from, to, qty);
      const qtyOk = Number.isInteger(qty) && qty >= 1 && qty <= 1000000;
      const statesOk = Number.isInteger(from) && from >= 0 && Number.isInteger(to) && to >= 0;
      const expectOk = qtyOk && statesOk && from >= qty && to + qty <= 10000000;
      expect(verdict.ok).toBe(expectOk);
      if (expectOk) {
        if (!verdict.ok) throw new Error('expected success');
        expect(verdict.value.newFrom).toBe(from - qty);
        expect(verdict.value.newTo).toBe(to + qty);
      }
    }
  });
});
