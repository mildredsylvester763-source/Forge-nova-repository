import { separateFacts } from './fact-claims';

// Deterministic RNG for the 500-case sweep (pinned seed, same law as every
// other Forge engine spec).
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('fact-claims engine (FORGE AI-067)', () => {
  it('refuses empty or malformed statements with named reasons', () => {
    expect(separateFacts({ statements: [] })).toMatchObject({ ok: false, reason: 'statements-empty' });
    expect(separateFacts({})).toMatchObject({ ok: false, reason: 'statements-empty' });
    expect(separateFacts({ statements: [{ text: '  ', sourceIds: ['a'] }] })).toMatchObject({
      ok: false,
      reason: 'statement-text-missing',
    });
    expect(separateFacts({ statements: [{ text: 'X' }] })).toMatchObject({
      ok: false,
      reason: 'statement-sources-missing',
    });
    expect(separateFacts({ statements: [{ text: 'X', sourceIds: ['a', ''] }] })).toMatchObject({
      ok: false,
      reason: 'statement-source-blank',
    });
  });

  it('pins the statement count cap', () => {
    const many: { text: string; sourceIds: string[] }[] = [];
    for (let i = 0; i < 201; i++) {
      many.push({ text: 's' + i, sourceIds: ['a'] });
    }
    expect(separateFacts({ statements: many })).toMatchObject({
      ok: false,
      reason: 'statements-count-invalid:201',
    });
  });

  it('separates corroborated facts from single-source claims', () => {
    const out = separateFacts({
      statements: [
        { text: 'Refunds take 5 days', sourceIds: ['doc-1', 'issue-7'] },
        { text: 'Charges retry', sourceIds: ['doc-2'] },
      ],
    });
    expect(out.ok).toBe(true);
    expect(out.factCount).toBe(1);
    expect(out.claimCount).toBe(1);
    expect(out.facts?.[0].kind).toBe('fact');
    expect(out.facts?.[0].sources).toEqual(['doc-1', 'issue-7']);
    expect(out.claims?.[0].kind).toBe('claim');
    expect(out.claims?.[0].sources).toEqual(['doc-2']);
  });

  it('never lets repeated sources fake corroboration', () => {
    const out = separateFacts({ statements: [{ text: 'X', sourceIds: ['a', 'a', 'a'] }] });
    expect(out.ok).toBe(true);
    expect(out.claims?.[0].sources).toEqual(['a']);
    expect(out.claimCount).toBe(1);
    expect(out.factCount).toBe(0);
  });

  it('matches an independent oracle on 500 mulberry32(42) cases', () => {
    const rand = mulberry32(42);
    for (let c = 0; c < 500; c++) {
      const n = 1 + Math.floor(rand() * 6);
      const statements: { text: string; sourceIds: string[] }[] = [];
      for (let i = 0; i < n; i++) {
        const srcN = 1 + Math.floor(rand() * 4);
        const sourceIds: string[] = [];
        for (let s = 0; s < srcN; s++) {
          sourceIds.push('src-' + Math.floor(rand() * 5));
        }
        statements.push({ text: 'claim-' + c + '-' + i, sourceIds });
      }
      const got = separateFacts({ statements });
      let fN = 0;
      let cN = 0;
      for (const st of statements) {
        const uniq = Array.from(new Set(st.sourceIds));
        if (uniq.length >= 2) {
          fN++;
        } else {
          cN++;
        }
      }
      expect(got.ok).toBe(true);
      expect(got.factCount).toBe(fN);
      expect(got.claimCount).toBe(cN);
    }
  });
});
