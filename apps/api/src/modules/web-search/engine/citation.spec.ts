import {
  normalizeClaim,
  parseSourceUrl,
  validateCitation,
} from './citation';

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

describe('citation engine (FORGE AI-059)', () => {
  it('normalizes claim whitespace and keeps the source url', () => {
    const v = validateCitation('Forge  is   best ', 'https://docs.example.com/x');
    if (!v.ok) throw new Error('expected ok');
    expect(v.claim).toBe('Forge is best');
    expect(v.source.host).toBe('docs.example.com');
    expect(v.source.url).toBe('https://docs.example.com/x');
  });

  it('only https sources are citable, every other shape is refused by name', () => {
    expect(validateCitation('a valid claim', 'http://x.com')).toEqual({
      ok: false,
      reason: 'citation-insecure-scheme:http',
    });
    expect(validateCitation('a valid claim', 'example.com/x')).toEqual({
      ok: false,
      reason: 'citation-missing-scheme',
    });
    expect(validateCitation('a valid claim', '')).toEqual({
      ok: false,
      reason: 'citation-missing-source',
    });
  });

  it('empty and too-short claims are refused by name', () => {
    expect(validateCitation('', 'https://x.com')).toEqual({
      ok: false,
      reason: 'citation-empty-claim',
    });
    expect(validateCitation('   ', 'https://x.com')).toEqual({
      ok: false,
      reason: 'citation-empty-claim',
    });
    expect(validateCitation('ab', 'https://x.com')).toEqual({
      ok: false,
      reason: 'citation-too-short',
    });
  });

  it('normalizeClaim collapses whitespace deterministically', () => {
    expect(normalizeClaim('  a   b  ')).toBe('a b');
    expect(normalizeClaim(undefined)).toBe('');
  });

  it('parseSourceUrl strips ports and userinfo from the host', () => {
    const v = parseSourceUrl('https://docs.example.com:8443/a');
    if (!v.ok) throw new Error('expected ok');
    expect(v.source.host).toBe('docs.example.com');
    const w = parseSourceUrl('https://user@docs.example.com/a');
    if (!w.ok) throw new Error('expected ok');
    expect(w.source.host).toBe('docs.example.com');
  });

  it('500-case sweep: normalization is exact and the https-only law holds', () => {
    const rand = mulberry32(42);
    const pool = [
      'forge', 'nova', 'guide', 'the', 'and', 'with',
      'serving', 'training', 'models', 'docs', 'quality', 'engine',
    ];
    for (let i = 0; i < 500; i++) {
      const nw = Math.floor(rand() * 6) + 1;
      const ws: string[] = [];
      for (let j = 0; j < nw; j++) ws.push(pool[Math.floor(rand() * pool.length)]);
      const sep = Array(Math.floor(rand() * 3) + 1).fill(' ').join('');
      const claim = ws.join(sep) + '  ';
      const v = validateCitation(claim, 'https://docs.example.com/x');
      if (!v.ok) throw new Error('expected ok at sweep ' + i);
      expect(v.claim).toBe(ws.join(' '));
      const insecure = validateCitation('ok claim words here', 'http://x' + i + '.com');
      expect(insecure).toEqual({ ok: false, reason: 'citation-insecure-scheme:http' });
      const blank = validateCitation('   \t  ', 'https://x.com');
      expect(blank).toEqual({ ok: false, reason: 'citation-empty-claim' });
    }
  });
});
