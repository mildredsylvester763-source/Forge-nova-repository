import { rankResults, tokenize } from './source-ranking';
import { RankableResult } from './source-ranking';

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

const NOW = new Date('2026-10-31T00:00:00.000Z');

describe('source-ranking engine (FORGE AI-057)', () => {
  it('tokenizes on non-alphanumerics and drops single characters', () => {
    expect(tokenize('Forge-Nova 2.5: the AI!')).toEqual(['forge', 'nova', 'the', 'ai']);
    expect(tokenize('')).toEqual([]);
  });

  it('ranks relevance 60, authority 30, freshness 10 with exact scores', () => {
    const strong: RankableResult = {
      title: 'Forge Nova AI platform overview',
      snippet: 'The forge nova platform explains the ai stack',
      url: 'https://docs.example.com/overview',
      authorityScore: 90,
      publishedAt: '2026-10-26',
    };
    const weak: RankableResult = {
      title: 'Random blog',
      snippet: 'nova elsewhere',
      url: 'https://blog.example.org/post',
      authorityScore: 20,
      publishedAt: null,
    };
    const v = rankResults('forge nova ai', [weak, strong], NOW);
    if (!v.ok) throw new Error('expected ok');
    expect(v.ranked).toHaveLength(2);
    expect(v.ranked[0].url).toBe(strong.url);
    expect(v.ranked[0].score).toBe(97);
    expect(v.ranked[0].relevance).toBe(100);
    expect(v.ranked[0].authority).toBe(90);
    expect(v.ranked[0].freshness).toBe(100);
    expect(v.ranked[0].reasons[0]).toBe('relevance:3/3 terms matched');
    expect(v.ranked[1].url).toBe(weak.url);
    expect(v.ranked[1].score).toBe(28);
    expect(v.ranked[1].relevance).toBe(33);
    expect(v.ranked[1].freshness).toBe(25);
    expect(v.skipped).toHaveLength(0);
  });

  it('authority defaults to 50 and is clamped to the 0..100 range', () => {
    const over: RankableResult = { title: 'alpha beta gamma', url: 'https://a.com/1', authorityScore: 140 };
    const under: RankableResult = { title: 'alpha beta gamma', url: 'https://a.com/2', authorityScore: -20 };
    const none: RankableResult = { title: 'alpha beta gamma', url: 'https://a.com/3' };
    const v = rankResults('alpha beta gamma', [over, under, none], NOW);
    if (!v.ok) throw new Error('expected ok');
    expect(v.ranked.find((r) => r.url.endsWith('1'))?.authority).toBe(100);
    expect(v.ranked.find((r) => r.url.endsWith('2'))?.authority).toBe(0);
    expect(v.ranked.find((r) => r.url.endsWith('3'))?.authority).toBe(50);
  });

  it('ties break by url ascending so the order is deterministic', () => {
    const a: RankableResult = { url: 'https://b.com/x', title: 'same words here' };
    const b: RankableResult = { url: 'https://a.com/y', title: 'same words here' };
    const v = rankResults('same words', [a, b], NOW);
    if (!v.ok) throw new Error('expected ok');
    expect(v.ranked[0].url).toBe('https://a.com/y');
    expect(v.ranked[1].url).toBe('https://b.com/x');
    expect(v.ranked[0].score).toBe(v.ranked[1].score);
  });

  it('duplicate urls are skipped with a named reason', () => {
    const first: RankableResult = { url: 'https://docs.example.com/overview', title: 'forge nova' };
    const v = rankResults('forge', [first, { ...first }], NOW);
    if (!v.ok) throw new Error('expected ok');
    expect(v.ranked).toHaveLength(1);
    expect(v.skipped).toEqual([{ url: 'https://docs.example.com/overview', reason: 'rank-duplicate-url' }]);
  });

  it('refusals are named: empty query, empty results, no usable results', () => {
    expect(rankResults('', [{ url: 'https://a.com', title: 'x' }], NOW)).toEqual({
      ok: false,
      reason: 'rank-empty-query',
    });
    expect(rankResults('query', [], NOW)).toEqual({ ok: false, reason: 'rank-empty-results' });
    expect(rankResults('query', [{ title: 'no url' } as unknown as RankableResult], NOW)).toEqual({
      ok: false,
      reason: 'rank-no-usable-results',
    });
  });

  it('invalid dates rank as unknown freshness, never faked', () => {
    const badDate: RankableResult = { url: 'https://a.com/1', title: 'alpha beta gamma', publishedAt: 'nope' };
    const v = rankResults('alpha beta gamma', [badDate], NOW);
    if (!v.ok) throw new Error('expected ok');
    expect(v.ranked[0].freshness).toBe(25);
    expect(v.ranked[0].reasons[2]).toBe('freshness:unknown');
  });

  it('500-case sweep: scores recompute exactly, order is monotone and tie-safe', () => {
    const rand = mulberry32(42);
    const words = ['forge', 'nova', 'guide', 'training', 'serving', 'models', 'platform', 'docs'];
    for (let i = 0; i < 500; i++) {
      const nq = Math.floor(rand() * 4) + 1;
      const qTokens: string[] = [];
      for (let j = 0; j < nq; j++) qTokens.push(words[Math.floor(rand() * words.length)]);
      const query = Array.from(new Set(qTokens)).join(' ');
      const nRes = Math.floor(rand() * 7) + 1;
      const results: RankableResult[] = [];
      for (let j = 0; j < nRes; j++) {
        const nw = Math.floor(rand() * 5);
        const t: string[] = [];
        for (let k = 0; k < nw; k++) t.push(words[Math.floor(rand() * words.length)]);
        const pub =
          rand() < 0.4
            ? null
            : rand() < 0.5
              ? 'nope'
              : new Date(NOW.getTime() - Math.floor(rand() * 500) * 86400000)
                  .toISOString()
                  .slice(0, 10);
        results.push({
          url: 'https://site' + j + '.example.com/page' + i,
          title: t.join(' ') || 'untitled',
          snippet: '',
          authorityScore: Math.floor(rand() * 140) - 20,
          publishedAt: pub,
        });
      }
      const v = rankResults(query, results, NOW);
      if (!v.ok) throw new Error('expected ok at sweep ' + i);
      const queryTokens = Array.from(new Set(tokenize(query)));
      const byUrl = new Map(results.map((r) => [r.url.trim().toLowerCase(), r]));
      let prevScore = 1e9;
      const seen = new Set<string>();
      for (const rr of v.ranked) {
        const src = byUrl.get(rr.url.trim().toLowerCase());
        if (!src) throw new Error('ranked url not in input at sweep ' + i);
        const hay = Array.from(new Set(tokenize((src.title ?? '') + ' ' + (src.snippet ?? ''))));
        const matched = queryTokens.filter((t) => hay.includes(t)).length;
        const relevance = Math.round((100 * matched) / queryTokens.length);
        const authority = Math.min(100, Math.max(0, Math.round(src.authorityScore ?? 50)));
        const f = src.publishedAt ?? null;
        const parsed = f === null ? 'unknown' : /^\d{4}-\d{2}-\d{2}/.test(f) && Number.isFinite(Date.parse(f)) && new Date(f).getTime() <= NOW.getTime()
          ? ((Math.floor((NOW.getTime() - new Date(f).getTime()) / 86400000) <= 30
              ? 'fresh'
              : Math.floor((NOW.getTime() - new Date(f).getTime()) / 86400000) <= 365
                ? 'current'
                : 'stale') as 'fresh' | 'current' | 'stale')
          : 'unknown';
        const freshness = parsed === 'fresh' ? 100 : parsed === 'current' ? 50 : parsed === 'unknown' ? 25 : 0;
        const score = Math.round(0.6 * relevance + 0.3 * authority + 0.1 * freshness);
        expect(rr.score).toBe(score);
        expect(rr.relevance).toBe(relevance);
        expect(rr.authority).toBe(authority);
        expect(rr.freshness).toBe(freshness);
        expect(rr.score).toBeLessThanOrEqual(prevScore);
        prevScore = rr.score;
        expect(seen.has(rr.url)).toBe(false);
        seen.add(rr.url);
      }
      for (let j = 1; j < v.ranked.length; j++) {
        if (v.ranked[j].score === v.ranked[j - 1].score) {
          expect(v.ranked[j - 1].url < v.ranked[j].url).toBe(true);
        }
      }
      expect(v.ranked.length + v.skipped.length).toBeLessThanOrEqual(results.length);
    }
  });
});
