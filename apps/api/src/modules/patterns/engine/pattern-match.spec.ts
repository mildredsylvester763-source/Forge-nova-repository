import { matchPatterns, MatchablePattern } from './pattern-match';

const P = (over: Partial<MatchablePattern>): MatchablePattern => ({
  id: over.id || 'p1',
  kind: 'success',
  title: over.title || 'Pattern',
  category: over.category || 'software_tools',
  source: over.source ?? null,
  tags: over.tags || [],
  summary: over.summary || 's',
  ...over,
});

describe('matchPatterns pinned vectors', () => {
  it('category match alone scores exactly 40 with a named reason', () => {
    const r = matchPatterns({ category: 'consulting', tags: [] }, [P({ id: 'a', category: 'consulting' })]);
    expect(r).toHaveLength(1);
    expect(r[0].score).toBe(40);
    expect(r[0].reasons[0]).toContain('Same category');
  });

  it('category + source scores exactly 60', () => {
    const r = matchPatterns(
      { category: 'consulting', source: 'reddit', tags: [] },
      [P({ id: 'a', category: 'consulting', source: 'reddit' })],
    );
    expect(r[0].score).toBe(60);
  });

  it('full house: category + source + 2 shared tags caps at 100, never beyond', () => {
    const r = matchPatterns(
      { category: 'consulting', source: 'reddit', tags: ['b2b', 'pricing', 'cold-outreach'] },
      [P({ category: 'consulting', source: 'reddit', tags: ['b2b', 'pricing', 'unrelated'] })],
    );
    expect(r[0].score).toBe(80); // 40 + 20 + 2 shared tags at 10 each = 80 — the tag cap never even binds.
  });

  it('tag matching is case-insensitive and whitespace-trimmed', () => {
    const r = matchPatterns({ category: 'x', tags: ['B2B'] }, [P({ category: 'other', tags: [' b2b '] })]);
    expect(r).toHaveLength(1);
    expect(r[0].score).toBe(10);
  });

  it('a pattern with nothing in common is excluded, never zero-padded', () => {
    const r = matchPatterns({ category: 'fashion', tags: ['socks'] }, [P({ category: 'software_tools', tags: ['devops'] })]);
    expect(r).toHaveLength(0);
  });

  it('FAILURE patterns match equally — relevance, not valence', () => {
    const r = matchPatterns({ category: 'consulting', tags: [] }, [P({ kind: 'failure', category: 'consulting' })]);
    expect(r[0].kind).toBe('failure');
    expect(r[0].score).toBe(40);
  });

  it('ranks by relevance, stable among equals', () => {
    const r = matchPatterns(
      { category: 'consulting', source: 'reddit', tags: ['b2b'] },
      [
        P({ id: 'weak', category: 'consulting' }),
        P({ id: 'strong', category: 'consulting', source: 'reddit', tags: ['b2b'] }),
        P({ id: 'equal-weak', category: 'consulting' }),
      ],
    );
    expect(r.map(m => m.patternId)).toEqual(['strong', 'weak', 'equal-weak']);
  });
});

describe('matchPatterns invariants', () => {
  function mulberry32(seed: number) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(919191);
  const cats = ['a', 'b', 'c', ''];
  const sources = ['reddit', 'twitter', null];
  const allTags = ['x', 'y', 'z', 'b2b'];

  it('never returns a score outside [1, 100] or a match without reasons (500 sweeps)', () => {
    for (let i = 0; i < 500; i++) {
      const patterns: MatchablePattern[] = [];
      for (let j = 0; j < 4; j++) {
        patterns.push(P({
          id: 'p' + j,
          category: cats[Math.floor(rand() * cats.length)],
          source: sources[Math.floor(rand() * sources.length)],
          tags: allTags.filter(() => rand() > 0.5),
        }));
      }
      const ctx = {
        category: cats[Math.floor(rand() * cats.length)],
        source: sources[Math.floor(rand() * sources.length)],
        tags: allTags.filter(() => rand() > 0.5),
      };
      const r = matchPatterns(ctx, patterns);
      for (const m of r) {
        expect(m.score).toBeGreaterThan(0);
        expect(m.score).toBeLessThanOrEqual(100);
        expect(m.reasons.length).toBeGreaterThan(0);
      }
      const scores = r.map(m => m.score);
      for (let k = 1; k < scores.length; k++) expect(scores[k - 1]).toBeGreaterThanOrEqual(scores[k]);
    }
  });

  it('is deterministic', () => {
    const ctx = { category: 'a', source: 'reddit', tags: ['x'] };
    const pats = [P({ id: 'a', category: 'a', tags: ['x'] }), P({ id: 'b', category: 'b' })];
    expect(matchPatterns(ctx, pats)).toEqual(matchPatterns(ctx, pats));
  });

  it('handles empty inputs without inventing matches', () => {
    expect(matchPatterns({ category: '', tags: [] }, [])).toEqual([]);
    expect(matchPatterns({ category: '', tags: [] }, [P({ category: '', tags: [] })])).toEqual([]);
  });
});
