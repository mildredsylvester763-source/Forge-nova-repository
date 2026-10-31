import { buildKnowledgePack, fnv1aHex } from './offline-packs';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('offline-packs engine (FORGE AI-072)', () => {
  it('refuses malformed packs with named reasons', () => {
    expect(buildKnowledgePack({ name: '', topics: ['med'] })).toMatchObject({ ok: false, reason: 'pack-name-missing' });
    expect(buildKnowledgePack({ name: 'p', topics: [] })).toMatchObject({ ok: false, reason: 'pack-topics-missing' });
    expect(buildKnowledgePack({ name: 'p', topics: ['med'], budgetKb: 0 })).toMatchObject({
      ok: false,
      reason: 'pack-budget-invalid:0',
    });
    expect(buildKnowledgePack({ name: 'p', topics: ['med'], articles: [] })).toMatchObject({
      ok: false,
      reason: 'pack-articles-empty',
    });
    expect(buildKnowledgePack({ name: 'p', topics: ['med'], articles: [{ title: 't', topic: 'arts', sizeKb: 5 }] })).toMatchObject({
      ok: false,
      reason: 'pack-article-topic-out-of-pack:arts',
    });
    expect(buildKnowledgePack({ name: 'p', topics: ['med'], budgetKb: 10, articles: [{ title: 'huge', topic: 'med', sizeKb: 20 }] })).toMatchObject({
      ok: false,
      reason: 'pack-article-size-invalid:20',
    });
  });

  it('selects articles greedily in topic order under the budget', () => {
    const out = buildKnowledgePack({
      name: 'field-medic-pack',
      topics: ['medicine', 'shelter'],
      budgetKb: 100,
      articles: [
        { title: 'Wound care basics', topic: 'Medicine', sizeKb: 40 },
        { title: 'Tarp shelter knots', topic: 'shelter', sizeKb: 30 },
        { title: 'Water purification', topic: 'medicine', sizeKb: 60 },
        { title: 'Fire starting', topic: 'shelter', sizeKb: 45 },
      ],
    });
    expect(out.ok).toBe(true);
    expect(out.articles?.map((a) => a.title)).toEqual(['Water purification', 'Wound care basics']);
    expect(out.sizeKb).toBe(100);
    expect(out.topics).toEqual(['medicine', 'shelter']);
    expect(out.checksum).toBe(fnv1aHex('Water purification|Wound care basics'));
  });

  it('keeps an article that exactly fits the budget', () => {
    const out = buildKnowledgePack({
      name: 'p',
      topics: ['med'],
      budgetKb: 5,
      articles: [{ title: 'ok', topic: 'med', sizeKb: 5 }],
    });
    expect(out.ok).toBe(true);
    expect(out.sizeKb).toBe(5);
  });

  it('matches an independent oracle on 500 mulberry32(42) cases', () => {
    const rand = mulberry32(42);
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
    const topicsPool = ['alpha', 'beta', 'gamma'];
    for (let c = 0; c < 500; c++) {
      const topics: string[] = [];
      const tn = 1 + Math.floor(rand() * 3);
      for (let i = 0; i < tn; i++) {
        const t = pick(topicsPool);
        if (!topics.includes(t)) {
          topics.push(t);
        }
      }
      const budget = 10 + Math.floor(rand() * 200);
      const arts: { title: string; topic: string; sizeKb: number }[] = [];
      const an = 1 + Math.floor(rand() * 8);
      for (let i = 0; i < an; i++) {
        arts.push({
          title: 'art-' + c + '-' + i,
          topic: pick(topics),
          sizeKb: 1 + Math.floor(rand() * Math.min(budget, 60)),
        });
      }
      const got = buildKnowledgePack({ name: 'pack-' + c, topics, budgetKb: budget, articles: arts });
      const cleaned = arts.map((a) => ({ ...a, topic: a.topic.trim().toLowerCase() }));
      cleaned.sort((a, b) => {
        const ta = topics.indexOf(a.topic);
        const tb = topics.indexOf(b.topic);
        if (ta !== tb) return ta - tb;
        if (a.sizeKb !== b.sizeKb) return b.sizeKb - a.sizeKb;
        return a.title.localeCompare(b.title);
      });
      const sel: typeof cleaned = [];
      let used = 0;
      for (const a of cleaned) {
        if (used + a.sizeKb <= budget) {
          sel.push(a);
          used += a.sizeKb;
        }
      }
      expect(got.ok).toBe(true);
      expect(got.articles).toEqual(sel);
      expect(got.sizeKb).toBe(used);
    }
  });
});
