import { analyzeSeo, validateMetaDescription, validateSeoKeyword, validateSeoTitle } from './seo-engine';

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

// The sweep oracle recomputes every check with independent substring and
// length logic, then compares the full check list and the score.

describe('seo-engine (pinned vectors)', () => {
  it('validates titles, meta descriptions and keywords by name', () => {
    expect(validateSeoTitle('  Best Cakes in Lagos  ')).toEqual({ ok: true, value: 'Best Cakes in Lagos' });
    expect(validateSeoTitle('x'.repeat(61))).toEqual({ ok: false, reason: 'seo-invalid-title' });
    expect(validateSeoTitle('   ')).toEqual({ ok: false, reason: 'seo-invalid-title' });
    expect(validateSeoTitle(4)).toEqual({ ok: false, reason: 'seo-invalid-title' });
    expect(validateMetaDescription('y'.repeat(160))).toEqual({ ok: true, value: 'y'.repeat(160) });
    expect(validateMetaDescription('y'.repeat(161))).toEqual({ ok: false, reason: 'seo-invalid-meta' });
    expect(validateSeoKeyword('  Custom Cakes  ')).toEqual({ ok: true, value: 'custom cakes' });
    expect(validateSeoKeyword('   ')).toEqual({ ok: false, reason: 'seo-invalid-keyword' });
  });

  it('scores a fully optimised page at every check', () => {
    const result = analyzeSeo({
      title: 'Custom cakes baked fresh every morning in Lagos',
      metaDescription:
        'We bake custom cakes for birthdays and weddings across Lagos with same day delivery available on weekdays.',
      slug: 'custom-cakes-lagos',
      keyword: 'custom cakes',
      firstHeading: 'Custom cakes made for you',
      bodyText: 'words '.repeat(50),
    });
    expect(result.score).toBe(result.total);
    expect(result.total).toBe(8);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it('scores an empty page at zero and accepts hyphenated keywords in slugs', () => {
    const empty = analyzeSeo({
      title: 'hi',
      metaDescription: 'hi',
      slug: 'hi',
      keyword: 'cakes',
      firstHeading: null,
      bodyText: '',
    });
    expect(empty.score).toBe(0);
    const hyphen = analyzeSeo({
      title: 'a',
      metaDescription: 'a',
      slug: 'custom-cakes-here',
      keyword: 'custom cakes',
      firstHeading: null,
      bodyText: '',
    });
    expect(hyphen.checks.find((check) => check.id === 'keyword-in-slug')?.passed).toBe(true);
    const plain = analyzeSeo({
      title: 'a',
      metaDescription: 'a',
      slug: 'customcakes',
      keyword: 'cakes',
      firstHeading: null,
      bodyText: '',
    });
    expect(plain.checks.find((check) => check.id === 'keyword-in-slug')?.passed).toBe(true);
  });
});

describe('seo-engine (500-case sweep, seed 42)', () => {
  it('matches an independent check-by-check oracle', () => {
    const rng = mulberry32(42);
    const words = ['custom', 'cakes', 'lagos', 'fresh', 'morning', 'birthday', 'wedding', 'cake'];
    const pickWord = () => words[Math.floor(rng() * words.length)];
    for (let i = 0; i < 500; i += 1) {
      const title = Array.from({ length: 2 + Math.floor(rng() * 6) }, pickWord).join(' ');
      const keyword = pickWord();
      const slug = Array.from({ length: 1 + Math.floor(rng() * 3) }, pickWord).join('-');
      const meta = title + ' ' + (rng() < 0.5 ? keyword : 'other');
      const heading = rng() < 0.5 ? keyword + ' heading' : 'plain heading';
      const body = 'x'.repeat(Math.floor(rng() * 260));
      const result = analyzeSeo({
        title,
        metaDescription: meta,
        slug,
        keyword,
        firstHeading: heading,
        bodyText: body,
      });
      const hyphen = keyword.split(/ +/).join('-');
      const expected = [
        title.toLowerCase().includes(keyword),
        meta.toLowerCase().includes(keyword),
        slug.includes(keyword) || slug.includes(hyphen),
        heading.toLowerCase().includes(keyword),
        title.trim().length >= 30 && title.trim().length <= 60,
        meta.trim().length >= 70 && meta.trim().length <= 160,
        slug.length >= 3 && slug.length <= 80,
        body.trim().length >= 200,
      ];
      expect(result.checks.map((check) => check.passed)).toEqual(expected);
      expect(result.score).toBe(expected.filter(Boolean).length);
    }
  });
});
