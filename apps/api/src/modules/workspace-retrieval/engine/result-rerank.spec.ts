import { RerankCandidate, rerank } from './result-rerank';

function oTokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0);
}

function oTermSet(text: string): Set<string> {
  return new Set(oTokenize(text));
}

function oJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 0;
  }
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) {
      inter++;
    }
  }
  return inter / (a.size + b.size - inter);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('rerank engine AI-065', () => {
  const cands: RerankCandidate[] = [
    { key: 'payments-service', title: 'Payments service', body: 'handles refunds', score: 0.9 },
    { key: 'Payments-Service ', title: 'Payments service duplicate', body: 'handles refunds', score: 0.95 },
    { key: 'design-doc', title: 'Design doc', body: 'colors and spacing', score: 0.5 },
  ];

  it('pins the refusal catalog', () => {
    expect(rerank({ candidates: [] })).toEqual({ ok: false, reason: 'rerank-candidates-empty' });
    expect(rerank({ candidates: 'x' as never })).toEqual({ ok: false, reason: 'rerank-candidates-empty' });
    expect(rerank({ candidates: [{ title: 'x', body: 'y', score: 1 }] as never })).toEqual({
      ok: false,
      reason: 'rerank-key-missing',
    });
    expect(rerank({ candidates: [{ key: 'k', title: 'x', body: 'y', score: 'high' as never }] })).toEqual({
      ok: false,
      reason: 'rerank-score-invalid',
    });
    expect(rerank({ candidates: cands, lambda: 1.5 })).toEqual({
      ok: false,
      reason: 'rerank-lambda-invalid',
    });
    expect(rerank({ candidates: cands, depth: 0 })).toEqual({
      ok: false,
      reason: 'rerank-depth-invalid',
    });
    expect(rerank({ candidates: cands, depth: 2.5 })).toEqual({
      ok: false,
      reason: 'rerank-depth-invalid',
    });
  });

  it('pins the dedup and diversity laws', () => {
    const dedup = rerank({ candidates: cands });
    expect(dedup.removedDuplicates).toBe(1);
    expect(dedup.results?.map((r) => r.key)).toEqual(['payments-service', 'design-doc']);
    expect(rerank({ candidates: cands, depth: 1 }).results?.length).toBe(1);
    expect(rerank({ candidates: cands, lambda: 0 }).results?.[0].score).toBe(0.9);
    const divCands: RerankCandidate[] = [
      { key: 'same-a', title: 'refund refund', body: 'refund refund', score: 0.8 },
      { key: 'same-b', title: 'refund refund', body: 'refund refund', score: 0.79 },
      { key: 'fresh', title: 'logo colors', body: 'brand spacing', score: 0.3 },
    ];
    expect(rerank({ candidates: divCands, lambda: 1, depth: 3 }).results?.map((r) => r.key)).toEqual([
      'same-a',
      'fresh',
      'same-b',
    ]);
  });

  it('sweeps 500 seeded cases against a brute force oracle', () => {
    const rnd = mulberry32(42);
    const bank = ['refund', 'charge', 'logo', 'spacing', 'case', 'edge', 'policy'];
    for (let i = 0; i < 500; i++) {
      const count = 1 + Math.floor(rnd() * 6);
      const scands: RerankCandidate[] = [];
      for (let j = 0; j < count; j++) {
        const dupKey = rnd() < 0.15 && j > 0;
        const key = dupKey ? scands[Math.floor(rnd() * j)].key : 'k' + j;
        scands.push({
          key,
          title: bank[Math.floor(rnd() * bank.length)] + (rnd() < 0.5 ? ' ' + bank[Math.floor(rnd() * bank.length)] : ''),
          body: bank[Math.floor(rnd() * bank.length)] + ' x' + j,
          score: Math.round(rnd() * 100) / 100,
        });
      }
      const lambda = [0, 0.5, 1][Math.floor(rnd() * 3)];
      const depth = 1 + Math.floor(rnd() * 10);
      const verdict = rerank({ candidates: scands, lambda, depth });
      const map = new Map<string, RerankCandidate>();
      let removed = 0;
      for (const c of scands) {
        const ck = c.key.trim().toLowerCase();
        if (map.has(ck)) {
          removed++;
        } else {
          map.set(ck, { key: c.key, title: c.title, body: c.body, score: c.score });
        }
      }
      const uniq = [...map.values()];
      const sets = uniq.map((c) => oTermSet(c.title + ' ' + c.body));
      const chosen: number[] = [];
      const pool = uniq.map((_, idx) => idx);
      while (chosen.length < Math.min(depth, uniq.length) && pool.length > 0) {
        let bi = -1;
        let bv = -Infinity;
        let bkey = '';
        for (const idx of pool) {
          let m = uniq[idx].score;
          for (const p of chosen) {
            const s = oJaccard(sets[idx], sets[p]);
            if (uniq[idx].score - lambda * s < m) {
              m = uniq[idx].score - lambda * s;
            }
          }
          const ck = uniq[idx].key.trim().toLowerCase();
          if (m > bv + 1e-12 || (Math.abs(m - bv) <= 1e-12 && (bi === -1 || ck < bkey))) {
            bv = m;
            bi = idx;
            bkey = ck;
          }
        }
        chosen.push(bi);
        pool.splice(pool.indexOf(bi), 1);
      }
      const wantKeys = chosen.map((idx) => uniq[idx].key);
      expect((verdict.results ?? []).map((c) => c.key)).toEqual(wantKeys);
      expect(verdict.removedDuplicates).toBe(removed);
    }
  });
});
