import {
  consignmentEconomics,
  planConsignmentTake,
  validateCommissionPct,
  validateConsignorName,
  validateConsignmentPrice,
  validateConsignmentQty,
  validateConsignmentSku,
} from './consignment-engine';

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

// The sweep oracle uses pure integer arithmetic: rounding half-up of
// num/den is floor((2*num + den) / (2*den)), an independent path from
// Math.round.

describe('consignment-engine (pinned vectors)', () => {
  it('validates names, skus, commissions, quantities and prices by name', () => {
    expect(validateConsignorName('  Ada Arts  ')).toEqual({ ok: true, value: 'Ada Arts' });
    expect(validateConsignorName('   ')).toEqual({ ok: false, reason: 'consignor-invalid-name' });
    expect(validateConsignorName(5)).toEqual({ ok: false, reason: 'consignor-invalid-name' });
    expect(validateConsignmentSku('  ART-1  ')).toEqual({ ok: true, value: 'ART-1' });
    expect(validateConsignmentSku('  ')).toEqual({ ok: false, reason: 'consignment-invalid-sku' });
    expect(validateConsignmentSku('x'.repeat(65))).toEqual({ ok: false, reason: 'consignment-invalid-sku' });
    expect(validateConsignmentSku(7)).toEqual({ ok: false, reason: 'consignment-invalid-sku' });
    expect(validateCommissionPct(0)).toEqual({ ok: true, value: 0 });
    expect(validateCommissionPct(100)).toEqual({ ok: true, value: 100 });
    expect(validateCommissionPct(101)).toEqual({ ok: false, reason: 'consignor-invalid-commission' });
    expect(validateCommissionPct(-1)).toEqual({ ok: false, reason: 'consignor-invalid-commission' });
    expect(validateCommissionPct(12.5)).toEqual({ ok: false, reason: 'consignor-invalid-commission' });
    expect(validateConsignmentQty(1000000)).toEqual({ ok: true, value: 1000000 });
    expect(validateConsignmentQty(1000001)).toEqual({ ok: false, reason: 'consignment-qty-too-large' });
    expect(validateConsignmentQty(0)).toEqual({ ok: false, reason: 'consignment-invalid-qty' });
    expect(validateConsignmentPrice(100000000)).toEqual({ ok: true, value: 100000000 });
    expect(validateConsignmentPrice(0)).toEqual({ ok: false, reason: 'consignment-invalid-price' });
    expect(validateConsignmentPrice(100000001)).toEqual({ ok: false, reason: 'consignment-price-too-large' });
  });

  it('splits sale economics exactly, including zero and full commission', () => {
    expect(consignmentEconomics(3, 500, 20)).toEqual({
      ok: true,
      value: { totalCents: 1500, commissionCents: 300, payoutCents: 1200 },
    });
    expect(consignmentEconomics(2, 333, 0)).toEqual({
      ok: true,
      value: { totalCents: 666, commissionCents: 0, payoutCents: 666 },
    });
    expect(consignmentEconomics(1, 100, 100)).toEqual({
      ok: true,
      value: { totalCents: 100, commissionCents: 100, payoutCents: 0 },
    });
  });

  it('plans takes the consigned stock can cover, refusing the rest by name', () => {
    expect(planConsignmentTake(10, 4)).toEqual({ ok: true, value: 6 });
    expect(planConsignmentTake(5, 6)).toEqual({ ok: false, reason: 'consignment-insufficient-stock' });
    expect(planConsignmentTake(0, 1)).toEqual({ ok: false, reason: 'consignment-insufficient-stock' });
    expect(planConsignmentTake(-2, 1)).toEqual({ ok: false, reason: 'consignment-invalid-state' });
  });
});

describe('consignment-engine (500-case sweep, seed 42)', () => {
  it('sale economics match an integer-arithmetic oracle', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const qty = 1 + Math.floor(rng() * 100);
      const price = 1 + Math.floor(rng() * 100000);
      const pct = Math.floor(rng() * 101);
      const verdict = consignmentEconomics(qty, price, pct);
      if (!verdict.ok) {
        throw new Error('expected computed economics');
      }
      const total = qty * price;
      const expectedCommission = Math.floor((2 * total * pct + 100) / 200);
      expect(verdict.value.totalCents).toBe(total);
      expect(verdict.value.commissionCents).toBe(expectedCommission);
      expect(verdict.value.payoutCents).toBe(total - expectedCommission);
    }
  });

  it('takes refuse exactly when qty exceeds the consigned stock', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const onConsignment = Math.floor(rng() * 50);
      const qty = 1 + Math.floor(rng() * 60);
      const verdict = planConsignmentTake(onConsignment, qty);
      if (qty > onConsignment) {
        expect(verdict).toEqual({ ok: false, reason: 'consignment-insufficient-stock' });
      } else {
        expect(verdict).toEqual({ ok: true, value: onConsignment - qty });
      }
    }
  });
});
