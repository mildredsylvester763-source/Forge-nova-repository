import {
  accruePoints,
  redeemPoints,
  grantPoints,
  EARN_UNIT_CENTS,
  MAX_REASON_LENGTH,
} from './loyalty-points';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('loyalty-points engine', () => {
  it('accrues one point per 100 cents, floored', () => {
    const v = accruePoints(1250, 'sale 123');
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.points).toBe(12);
  });

  it('pins the earn unit at 100 cents', () => {
    expect(EARN_UNIT_CENTS).toBe(100);
  });

  it('refuses amounts below one earn unit', () => {
    const v = accruePoints(99, 'x');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('loyalty-amount-too-small');
  });

  it('refuses non-integer and non-number amounts', () => {
    const a = accruePoints(100.5, 'x');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('loyalty-invalid-amount');
    const b = accruePoints('100', 'x');
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('loyalty-invalid-amount');
  });

  it('refuses empty and over-long reasons', () => {
    const a = accruePoints(500, '   ');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('loyalty-invalid-reason');
    const b = accruePoints(500, 'r'.repeat(MAX_REASON_LENGTH + 1));
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('loyalty-reason-length');
  });

  it('redeems points one-to-one into cents and lowers the balance', () => {
    const v = redeemPoints(10, 4, 'gift');
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.valueCents).toBe(4);
      expect(v.value.balanceAfter).toBe(6);
    }
  });

  it('refuses redeeming more points than the balance holds', () => {
    const v = redeemPoints(3, 4, 'gift');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('loyalty-insufficient-points');
  });

  it('refuses invalid balances and points', () => {
    const a = redeemPoints(-1, 1, 'x');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('loyalty-invalid-balance');
    const b = redeemPoints(10, 0, 'x');
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('loyalty-invalid-points');
  });

  it('grants points on top of a balance', () => {
    const v = grantPoints(5, 500, 'referral reward');
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.balanceAfter).toBe(505);
  });

  it('refuses grants with invalid points', () => {
    const v = grantPoints(5, 0, 'x');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('loyalty-invalid-points');
  });

  it('sweeps 500 random cases without breaking invariants', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const cents = Math.floor(rng() * 25000) + 100;
      const av = accruePoints(cents, 'sweep ' + i);
      expect(av.ok).toBe(true);
      if (av.ok) {
        expect(av.value.points).toBe(Math.floor(cents / 100));
      }
      const bal = Math.floor(rng() * 1000);
      const pts = Math.floor(rng() * 1000);
      const rv = redeemPoints(bal, pts, 'sweep');
      const shouldPass = pts >= 1 && pts <= bal;
      expect(rv.ok).toBe(shouldPass);
      if (rv.ok) {
        expect(rv.value.balanceAfter).toBe(bal - pts);
        expect(rv.value.valueCents).toBe(pts);
      }
    }
  });
});
