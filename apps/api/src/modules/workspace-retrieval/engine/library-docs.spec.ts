import { LIBRARY_CATALOG, searchLibraryDocs } from './library-docs';

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

describe('library docs engine AI-062', () => {
  it('pins the refusal catalog', () => {
    expect(searchLibraryDocs({ library: 'vue', version: '18.2.0', query: 'state' })).toEqual({
      ok: false,
      reason: 'docs-library-unknown:vue',
    });
    expect(searchLibraryDocs({ version: '18.2.0', query: 'state' })).toEqual({
      ok: false,
      reason: 'docs-library-missing',
    });
    expect(searchLibraryDocs({ library: 'react', query: 'state' })).toEqual({
      ok: false,
      reason: 'docs-version-missing',
    });
    expect(searchLibraryDocs({ library: 'react', version: '17.0.2', query: 'state' })).toEqual({
      ok: false,
      reason: 'docs-version-unknown:react:17.0.2',
    });
    expect(searchLibraryDocs({ library: 'react', version: '18.2.0' })).toEqual({
      ok: false,
      reason: 'docs-query-missing',
    });
  });

  it('pins the version law', () => {
    expect(
      searchLibraryDocs({ library: 'React', version: '18.2.0', query: 'state' }).results?.map(
        (r) => r.symbol,
      ),
    ).toEqual(['useState']);
    expect(
      searchLibraryDocs({ library: 'react', version: '19.0.0', query: 'state actions' }).results?.map(
        (r) => r.symbol,
      ),
    ).toEqual(['useState']);
    expect(
      searchLibraryDocs({ library: 'react', version: '18.2.0', query: 'promise context render' })
        .results?.length,
    ).toBe(0);
    expect(
      searchLibraryDocs({ library: 'typeorm', version: '0.3.20', query: 'database connections' })
        .results?.map((r) => r.symbol),
    ).toEqual(['DataSource']);
    expect(
      searchLibraryDocs({ library: 'typeorm', version: '0.3.17', query: 'rows where' }).results?.map(
        (r) => r.symbol,
      ),
    ).toEqual(['Repository.find']);
  });

  it('sweeps 500 seeded cases against an independent oracle', () => {
    const rnd = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const roll = rnd();
      let input: { library?: string; version?: string; query?: string };
      if (roll < 0.1) {
        input = { library: 'vue', version: '18.2.0', query: 'state' };
      } else if (roll < 0.15) {
        input = { library: 'react', version: '17.0.2', query: 'state' };
      } else {
        const lib = LIBRARY_CATALOG[Math.floor(rnd() * LIBRARY_CATALOG.length)];
        const version = lib.versions[Math.floor(rnd() * lib.versions.length)];
        const wordBank = [
          'state', 'value', 'render', 'hook', 'rows', 'promise', 'server', 'listen',
          'cache', 'database', 'query', 'promise', 'routes',
        ];
        const wordCount = 1 + Math.floor(rnd() * 3);
        let q = '';
        for (let w = 0; w < wordCount; w++) {
          q += (w > 0 ? ' ' : '') + wordBank[Math.floor(rnd() * wordBank.length)];
        }
        input = { library: lib.name, version, query: rnd() < 0.05 ? '   ' : q };
      }
      const verdict = searchLibraryDocs(input);
      const libName = typeof input.library === 'string' ? input.library.trim().toLowerCase() : '';
      const rec = LIBRARY_CATALOG.find((l) => l.name === libName);
      if (!rec) {
        const want = libName.length === 0 ? 'docs-library-missing' : 'docs-library-unknown:' + libName;
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe(want);
        continue;
      }
      const ver = typeof input.version === 'string' ? input.version.trim() : '';
      if (ver.length === 0) {
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe('docs-version-missing');
        continue;
      }
      if (!rec.versions.includes(ver)) {
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe('docs-version-unknown:' + libName + ':' + ver);
        continue;
      }
      const q = typeof input.query === 'string' ? input.query.trim().toLowerCase() : '';
      if (q.length === 0) {
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toBe('docs-query-missing');
        continue;
      }
      const terms = q.split(' ');
      const wantSyms = (rec.docs[ver] ?? [])
        .filter((e) => {
          const hay = (e.symbol + ' ' + e.kind + ' ' + e.summary).toLowerCase();
          return terms.every((t) => hay.indexOf(t) !== -1);
        })
        .map((e) => e.symbol);
      expect((verdict.results ?? []).map((e) => e.symbol)).toEqual(wantSyms);
    }
  });
});
