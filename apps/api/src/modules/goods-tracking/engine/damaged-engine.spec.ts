import {
  planDamageWriteOff,
  validateDamageNote,
  validateDamageQty,
  validateDamageReason,
} from './damaged-engine';

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

describe('damaged-engine (pinned vectors)', () => {
  it('validates quantities by name, with vectors at the cap', () => {
    expect(validateDamageQty(1)).toEqual({ ok: true, value: 1 });
    expect(validateDamageQty(0)).toEqual({ ok: false, reason: 'damage-invalid-qty' });
    expect(validateDamageQty(2.5)).toEqual({ ok: false, reason: 'damage-invalid-qty' });
    expect(validateDamageQty('3')).toEqual({ ok: false, reason: 'damage-invalid-qty' });
    expect(validateDamageQty(1000000)).toEqual({ ok: true, value: 1000000 });
    expect(validateDamageQty(1000001)).toEqual({ ok: false, reason: 'damage-qty-too-large' });
  });

  it('trims reasons and notes to honest values or refuses by name', () => {
    expect(validateDamageReason('  broken in transit  ')).toEqual({ ok: true, value: 'broken in transit' });
    expect(validateDamageReason('   ')).toEqual({ ok: false, reason: 'damage-invalid-reason' });
    expect(validateDamageReason('x'.repeat(81))).toEqual({ ok: false, reason: 'damage-invalid-reason' });
    expect(validateDamageReason(7)).toEqual({ ok: false, reason: 'damage-invalid-reason' });
    expect(validateDamageNote(undefined)).toEqual({ ok: true, value: null });
    expect(validateDamageNote('   ')).toEqual({ ok: true, value: null });
    expect(validateDamageNote(' shelf fell ')).toEqual({ ok: true, value: 'shelf fell' });
    expect(validateDamageNote('x'.repeat(281))).toEqual({ ok: false, reason: 'damage-invalid-note' });
  });

  it('plans write-offs the stock can cover, refusing the rest by name', () => {
    expect(planDamageWriteOff(10, 3)).toEqual({ ok: true, value: 7 });
    expect(planDamageWriteOff(10, 10)).toEqual({ ok: true, value: 0 });
    expect(planDamageWriteOff(10, 11)).toEqual({ ok: false, reason: 'damage-insufficient-stock' });
    expect(planDamageWriteOff(0, 1)).toEqual({ ok: false, reason: 'damage-insufficient-stock' });
    expect(planDamageWriteOff(-1, 1)).toEqual({ ok: false, reason: 'damage-invalid-state' });
  });
});

describe('damaged-engine (500-case sweep, seed 42)', () => {
  it('write-offs refuse exactly when qty exceeds on-hand', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const onHand = Math.floor(rng() * 50);
      const qty = 1 + Math.floor(rng() * 60);
      const verdict = planDamageWriteOff(onHand, qty);
      if (qty > onHand) {
        expect(verdict).toEqual({ ok: false, reason: 'damage-insufficient-stock' });
      } else {
        expect(verdict).toEqual({ ok: true, value: onHand - qty });
      }
    }
  });
});
