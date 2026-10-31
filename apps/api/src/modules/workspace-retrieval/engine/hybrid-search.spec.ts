import { HybridDoc, hybridSearch } from './hybrid-search';

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function oTokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0);
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

describe('hybrid search engine AI-064', () => {
  const docs: HybridDoc[] = [
    { id: 'd1', title: 'Payments service', body: 'handles refunds', links: ['d3'] },
    { id: 'd2', title: 'Design doc', body: 'colors and spacing', links: [] },
    { id: 'd3', title: 'Refund notes', body: 'refund edge cases', links: ['d1'] },
  ];

  it('pins the refusal catalog', () => {
    expect(hybridSearch({ docs, query: '  ' })).toEqual({ ok: false, reason: 'hybrid-query-missing' });
    expect(hybridSearch({ docs, query: 'refund', lanes: ['keyword', 'semantic'] })).toEqual({
      ok: false,
      reason: 'hybrid-lane-unknown:semantic',
    });
    expect(hybridSearch({ docs, query: 'refund', lanes: 'keyword' as never })).toEqual({
      ok: false,
      reason: 'hybrid-lanes-not-array',
    });
    expect(hybridSearch({ docs, query: 'refund', lanes: [] })).toEqual({
      ok: false,
      reason: 'hybrid-lanes-empty',
    });
    expect(
      hybridSearch({ docs, query: 'refund', weights: { keyword: 'x', vector: 1, graph: 1 } }),
    ).toEqual({ ok: false, reason: 'hybrid-weights-invalid' });
    expect(hybridSearch({ docs, query: 'refund', weights: { keyword: 0, vector: 0, graph: 0 } })).toEqual({
      ok: false,
      reason: 'hybrid-weights-invalid',
    });
  });

  it('pins the lane laws', () => {
    expect(hybridSearch({ docs, query: 'refund', lanes: ['keyword'] }).hits?.map((h) => h.id)).toEqual([
      'd3',
    ]);
    expect(hybridSearch({ docs, query: 'refund', lanes: ['graph'] }).hits?.map((h) => h.id)).toEqual([
      'd1',
    ]);
    expect(
      (hybridSearch({ docs, query: 'refund', lanes: ['vector'] }).hits?.length ?? 0) > 0,
    ).toBe(true);
    expect(hybridSearch({ docs, query: 'refund edge cases' }).hits?.[0].id).toBe('d3');
    expect(
      hybridSearch({
        docs: [
          { id: 'b', title: 'x', body: 'y' },
          { id: 'a', title: 'x', body: 'y' },
        ],
        query: 'x',
      }).hits?.map((h) => h.id),
    ).toEqual(['a', 'b']);
  });

  it('sweeps 500 seeded cases against an independent fusion oracle', () => {
    const rnd = mulberry32(42);
    const bank = ['refund', 'charge', 'logo', 'spacing', 'case', 'edge', 'policy'];
    for (let i = 0; i < 500; i++) {
      const count = 1 + Math.floor(rnd() * 5);
      const sdocs: HybridDoc[] = [];
      for (let j = 0; j < count; j++) {
        const linkCount = Math.floor(rnd() * 3);
        const links: string[] = [];
        for (let l = 0; l < linkCount; l++) {
          links.push('d' + (1 + Math.floor(rnd() * count)));
        }
        sdocs.push({
          id: 'd' + (j + 1),
          title: bank[Math.floor(rnd() * bank.length)] + ' ' + bank[Math.floor(rnd() * bank.length)],
          body: bank[Math.floor(rnd() * bank.length)] + ' filler ' + bank[Math.floor(rnd() * bank.length)],
          links,
        });
      }
      const query = bank[Math.floor(rnd() * bank.length)] + (rnd() < 0.4 ? ' ' + bank[Math.floor(rnd() * bank.length)] : '');
      const laneRoll = rnd();
      const lanes = laneRoll < 0.3 ? undefined : ['keyword', 'vector', 'graph'].slice(0, 1 + Math.floor(rnd() * 3));
      const wRoll = rnd();
      const weights = wRoll < 0.2 ? { keyword: rnd(), vector: rnd(), graph: rnd() } : undefined;
      const verdict = hybridSearch({ docs: sdocs, query, lanes, weights });
      const terms = oTokenize(query.trim());
      const kw: Record<string, number> = {};
      for (const doc of sdocs) {
        const hay = oTokenize(doc.title + ' ' + doc.body);
        let c = 0;
        for (const t of terms) {
          if (hay.indexOf(t) !== -1) {
            c++;
          }
        }
        kw[doc.id] = terms.length === 0 ? 0 : c / terms.length;
      }
      const vs: Record<string, number> = {};
      const qv2 = new Array(64).fill(0);
      for (const t of terms) {
        qv2[fnv1a(t) % 64] += 1;
      }
      for (const doc of sdocs) {
        const dv = new Array(64).fill(0);
        for (const t of oTokenize(doc.title + ' ' + doc.body)) {
          dv[fnv1a(t) % 64] += 1;
        }
        let dot = 0;
        let n1 = 0;
        let n2 = 0;
        for (let d2 = 0; d2 < 64; d2++) {
          dot += qv2[d2] * dv[d2];
          n1 += qv2[d2] * qv2[d2];
          n2 += dv[d2] * dv[d2];
        }
        vs[doc.id] = n1 === 0 || n2 === 0 ? 0 : dot / Math.sqrt(n1) / Math.sqrt(n2);
      }
      const gs: Record<string, number> = {};
      for (const doc of sdocs) {
        let best = 0;
        for (const link of doc.links) {
          if ((kw[link] ?? 0) > best) {
            best = kw[link];
          }
        }
        gs[doc.id] = best;
      }
      const useLanes = lanes ?? ['keyword', 'vector', 'graph'];
      const wts = weights ?? { keyword: 1, vector: 1, graph: 1 };
      const fuse = (s: Record<string, number>): Record<string, number> => {
        let mx = 0;
        for (const doc of sdocs) {
          if (s[doc.id] > mx) {
            mx = s[doc.id];
          }
        }
        const out: Record<string, number> = {};
        for (const doc of sdocs) {
          out[doc.id] = mx > 0 ? s[doc.id] / mx : 0;
        }
        return out;
      };
      const kwN = fuse(kw);
      const vsN = fuse(vs);
      const gsN = fuse(gs);
      const want = sdocs
        .map((doc) => {
          let f = 0;
          if (useLanes.includes('keyword')) {
            f += wts.keyword * kwN[doc.id];
          }
          if (useLanes.includes('vector')) {
            f += wts.vector * vsN[doc.id];
          }
          if (useLanes.includes('graph')) {
            f += wts.graph * gsN[doc.id];
          }
          return { id: doc.id, f };
        })
        .filter((h) => h.f > 0)
        .sort((a, b) => b.f - a.f || (a.id < b.id ? -1 : 1))
        .map((h) => h.id + '#' + h.f.toFixed(6));
      expect((verdict.hits ?? []).map((h) => h.id + '#' + h.score.toFixed(6))).toEqual(want);
    }
  });
});
