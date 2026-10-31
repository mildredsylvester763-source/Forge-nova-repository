import { searchReferences, REFERENCE_MEDIA, REFERENCE_LICENSES, REFERENCE_CATALOG } from './reference-search';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('reference-search engine (FORGE AI-069)', () => {
  it('refuses missing query and unknown medium or license with named reasons', () => {
    expect(searchReferences({ query: '  ' })).toMatchObject({ ok: false, reason: 'reference-query-missing' });
    expect(searchReferences({ query: 'hand', medium: 'sculpt' })).toMatchObject({
      ok: false,
      reason: 'reference-medium-unknown:sculpt',
    });
    expect(searchReferences({ query: 'hand', license: 'gpl' })).toMatchObject({
      ok: false,
      reason: 'reference-license-unknown:gpl',
    });
  });

  it('AND-matches query terms over titles and tags', () => {
    const out = searchReferences({ query: 'palette study' });
    expect(out.ok).toBe(true);
    expect(out.results?.map((r) => r.id)).toEqual(['col-001']);
    const all = searchReferences({ query: 'cyberpunk street moodboard' });
    expect(all.results?.map((r) => r.id)).toEqual(['mood-001']);
  });

  it('filters by medium and license together', () => {
    const out = searchReferences({ query: 'moodboard', medium: 'moodboard', license: 'cc0' });
    expect(out.results?.map((r) => r.id)).toEqual(['mood-002']);
  });

  it('returns honest empties for unknown terms', () => {
    const out = searchReferences({ query: 'zzz-none' });
    expect(out.results).toEqual([]);
  });

  it('exposes the pinned media and license catalogs', () => {
    expect(REFERENCE_MEDIA).toEqual(['pose', 'anatomy', 'environment', 'texture', 'moodboard', 'color']);
    expect(REFERENCE_LICENSES).toEqual(['cc0', 'free', 'public-domain', 'owned']);
  });

  it('matches an independent oracle on 500 mulberry32(42) cases', () => {
    const rand = mulberry32(42);
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
    const allTags = [
      'standing', 'sitting', 'figure', 'hand', 'skull', 'forest', 'city',
      'bark', 'rust', 'cyberpunk', 'cozy', 'sunset', 'neon', 'palette',
      'texture', 'study', 'zzz',
    ];
    for (let c = 0; c < 500; c++) {
      const tn = 1 + Math.floor(rand() * 3);
      const terms: string[] = [];
      for (let t = 0; t < tn; t++) {
        terms.push(pick(allTags));
      }
      const query = terms.join(' ');
      const medium = rand() < 0.4 ? pick(REFERENCE_MEDIA) : undefined;
      const license = rand() < 0.4 ? pick(REFERENCE_LICENSES) : undefined;
      const got = searchReferences({ query, medium, license });
      const want = REFERENCE_CATALOG.filter((a) => {
        if (medium && a.medium !== medium) return false;
        if (license && a.license !== license) return false;
        const hay = (a.title + ' ' + a.tags.join(' ')).toLowerCase();
        return terms.every((t) => hay.includes(t));
      });
      expect(got.ok).toBe(true);
      expect(got.results).toEqual(want);
    }
  });
});
