import {
  fefoOrder,
  isExpiringSoon,
  isExpiredBatch,
  planBatchPick,
  validateBatchCode,
  validateBatchQty,
  validateExpiresAt,
  validateExpiryWindow,
} from './batch-engine';

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

const NOW = 5000;
const BATCH_MAX_LIFETIME_MS = 10 * 365 * 24 * 3600 * 1000;

describe('batch-engine (pinned vectors)', () => {
  it('validates codes, quantities and windows by name', () => {
    expect(validateBatchCode('  LOT-2024-A  ')).toEqual({ ok: true, value: 'LOT-2024-A' });
    expect(validateBatchCode('   ')).toEqual({ ok: false, reason: 'batch-invalid-code' });
    expect(validateBatchCode('x'.repeat(41))).toEqual({ ok: false, reason: 'batch-invalid-code' });
    expect(validateBatchQty(100)).toEqual({ ok: true, value: 100 });
    expect(validateBatchQty(0)).toEqual({ ok: false, reason: 'batch-invalid-qty' });
    expect(validateBatchQty(1.5)).toEqual({ ok: false, reason: 'batch-invalid-qty' });
    expect(validateExpiryWindow(7)).toEqual({ ok: true, value: 7 });
    expect(validateExpiryWindow(0)).toEqual({ ok: false, reason: 'batch-invalid-window' });
    expect(validateExpiryWindow(366)).toEqual({ ok: false, reason: 'batch-invalid-window' });
  });

  it('validates expiry dates against the receive time', () => {
    expect(validateExpiresAt(2000, 1000)).toEqual({ ok: true, value: 2000 });
    expect(validateExpiresAt(1000, 1000)).toEqual({ ok: false, reason: 'batch-expiry-in-past' });
    expect(validateExpiresAt(500, 1000)).toEqual({ ok: false, reason: 'batch-expiry-in-past' });
    expect(validateExpiresAt(1000 + BATCH_MAX_LIFETIME_MS + 1, 1000)).toEqual({
      ok: false,
      reason: 'batch-expiry-too-far',
    });
    expect(validateExpiresAt(1.5, 1000)).toEqual({ ok: false, reason: 'batch-invalid-expiry' });
  });

  it('flags expired and soon-expiring batches exactly', () => {
    const early = { id: 'early', expiresAtMs: 4000, remainingQty: 1 };
    const soon = { id: 'soon', expiresAtMs: NOW + 2 * 24 * 3600 * 1000, remainingQty: 1 };
    const late = { id: 'late', expiresAtMs: NOW + 100 * 24 * 3600 * 1000, remainingQty: 1 };
    expect(isExpiredBatch(early, NOW)).toBe(true);
    expect(isExpiredBatch(soon, NOW)).toBe(false);
    expect(isExpiringSoon(early, NOW, 7)).toBe(false);
    expect(isExpiringSoon(soon, NOW, 7)).toBe(true);
    expect(isExpiringSoon(late, NOW, 7)).toBe(false);
    expect(isExpiringSoon(soon, NOW, 1)).toBe(false);
  });

  it('orders FEFO by earliest expiry, skipping expired and empty batches, ties stable', () => {
    const bA = { id: 'a', expiresAtMs: 9000, remainingQty: 4 };
    const bB = { id: 'b', expiresAtMs: 7000, remainingQty: 4 };
    const bC = { id: 'c', expiresAtMs: 4000, remainingQty: 10 };
    const bD = { id: 'd', expiresAtMs: 9000, remainingQty: 2 };
    expect(fefoOrder([bA, bB, bC], NOW).map((b) => b.id)).toEqual(['b', 'a']);
    expect(fefoOrder([bA, bD, bB], NOW).map((b) => b.id)).toEqual(['b', 'a', 'd']);
    expect(fefoOrder([{ id: 'z', expiresAtMs: 6000, remainingQty: 0 }, bB], NOW).map((b) => b.id)).toEqual(['b']);
  });

  it('picks FEFO allocations across batches or refuses by name', () => {
    const bA = { id: 'a', expiresAtMs: 9000, remainingQty: 4 };
    const bB = { id: 'b', expiresAtMs: 7000, remainingQty: 4 };
    const bC = { id: 'c', expiresAtMs: 4000, remainingQty: 10 };
    expect(planBatchPick([bA, bB, bC], 6, NOW)).toEqual({
      ok: true,
      value: [
        { batchId: 'b', qty: 4 },
        { batchId: 'a', qty: 2 },
      ],
    });
    expect(planBatchPick([bA, bB, bC], 3, NOW)).toEqual({
      ok: true,
      value: [{ batchId: 'b', qty: 3 }],
    });
    expect(planBatchPick([bA, bB, bC], 9, NOW)).toEqual({ ok: false, reason: 'batch-insufficient-stock' });
    expect(planBatchPick([bC], 1, NOW)).toEqual({ ok: false, reason: 'batch-insufficient-stock' });
    expect(planBatchPick([bA, bB, bC], 0, NOW)).toEqual({ ok: false, reason: 'batch-invalid-qty' });
  });
});

describe('batch-engine (500-case sweep, seed 42)', () => {
  it('expiry validity follows the range rules exactly', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const receivedAt = Math.floor(rng() * 1000000);
      const offset = Math.floor(rng() * (BATCH_MAX_LIFETIME_MS + 200000)) - 100000;
      const exp = receivedAt + offset;
      const verdict = validateExpiresAt(exp, receivedAt);
      expect(verdict.ok).toBe(Number.isInteger(exp) && exp > receivedAt && exp <= receivedAt + BATCH_MAX_LIFETIME_MS);
    }
  });

  it('FEFO picks always match an independent oracle allocation', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const now = Math.floor(rng() * 100000);
      const n = 1 + Math.floor(rng() * 5);
      const batches: Array<{ id: string; expiresAtMs: number; remainingQty: number }> = [];
      for (let j = 0; j < n; j++) {
        batches.push({
          id: 'b' + j,
          expiresAtMs: now + Math.floor(rng() * 20000) - 5000,
          remainingQty: Math.floor(rng() * 10),
        });
      }
      const qty = 1 + Math.floor(rng() * 25);
      const verdict = planBatchPick(batches, qty, now);
      const fresh = batches.filter((b) => b.expiresAtMs > now && b.remainingQty > 0);
      const sorted = fresh
        .map((b, idx) => ({ b, idx }))
        .sort((x, y) => (x.b.expiresAtMs === y.b.expiresAtMs ? x.idx - y.idx : x.b.expiresAtMs - y.b.expiresAtMs))
        .map((x) => x.b);
      const total = sorted.reduce((acc, b) => acc + b.remainingQty, 0);
      if (total < qty) {
        expect(verdict).toEqual({ ok: false, reason: 'batch-insufficient-stock' });
        continue;
      }
      if (!verdict.ok) throw new Error('expected a built allocation');
      let remaining = qty;
      const expected: Array<{ batchId: string; qty: number }> = [];
      for (const b of sorted) {
        if (remaining <= 0) break;
        const take = Math.min(b.remainingQty, remaining);
        if (take > 0) {
          expected.push({ batchId: b.id, qty: take });
          remaining -= take;
        }
      }
      expect(verdict.value).toEqual(expected);
    }
  });
});
