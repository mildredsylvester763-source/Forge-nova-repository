import { extractPage } from './page-extraction';

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

describe('page-extraction engine (FORGE AI-058)', () => {
  it('strips boilerplate, extracts the title, date and an exact word count', () => {
    const html =
      '<html><head><title>Forge Guide</title><meta name="date" content="2026-10-01"></head>' +
      '<body><nav>menu home about</nav><script>secretTracker()</script><style>.x{}</style>' +
      '<header>site header</header><main><p>The forge guide explains nova training and serving with real examples for every feature.</p></main>' +
      '<footer>copyright footer</footer></body></html>';
    const v = extractPage(html);
    if (!v.ok) throw new Error('expected ok');
    expect(v.page.title).toBe('Forge Guide');
    expect(v.page.publishedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(v.page.wordCount).toBe(14);
    expect(v.page.text.includes('secretTracker')).toBe(false);
    expect(v.page.text.includes('copyright footer')).toBe(false);
    expect(v.page.text.includes('menu home about')).toBe(false);
    expect(v.page.text.includes('site header')).toBe(false);
    expect(v.page.text.startsWith('The forge guide explains')).toBe(true);
  });

  it('reads the datetime attribute of a time element', () => {
    const html =
      '<html><body><time datetime="2026-05-10T10:00:00Z">May</time>' +
      '<p>one two three four five six seven eight nine ten eleven twelve</p></body></html>';
    const v = extractPage(html);
    if (!v.ok) throw new Error('expected ok');
    expect(v.page.publishedAt).toBe('2026-05-10T10:00:00.000Z');
  });

  it('decodes the common entities', () => {
    const html =
      '<html><body><p>Cats &amp; dogs &quot;play&quot; together every single sunny day outside in the garden.</p></body></html>';
    const v = extractPage(html);
    if (!v.ok) throw new Error('expected ok');
    expect(v.page.text.startsWith('Cats & dogs "play"')).toBe(true);
    expect(v.page.wordCount).toBe(13);
  });

  it('refuses empty html and text-light pages by name', () => {
    expect(extractPage('   ')).toEqual({ ok: false, reason: 'extract-empty-html' });
    expect(extractPage('<p>short</p>')).toEqual({ ok: false, reason: 'extract-no-readable-text' });
  });

  it('invalid date candidates stay null, never faked', () => {
    const html =
      '<html><body><time datetime="not-a-date">x</time>' +
      '<p>one two three four five six seven eight nine ten eleven twelve</p></body></html>';
    const v = extractPage(html);
    if (!v.ok) throw new Error('expected ok');
    expect(v.page.publishedAt).toBeNull();
  });

  it('500-case sweep: word counts exact, boilerplate never leaks, deterministic', () => {
    const rand = mulberry32(42);
    const pool = [
      'forge', 'nova', 'guide', 'the', 'and', 'with',
      'serving', 'training', 'models', 'docs', 'quality', 'engine',
    ];
    for (let i = 0; i < 500; i++) {
      const n = Math.floor(rand() * 50) + 10;
      const ws: string[] = [];
      for (let j = 0; j < n; j++) ws.push(pool[Math.floor(rand() * pool.length)]);
      const withTitle = rand() < 0.5;
      const title = withTitle ? '<title>Sweep ' + i + '</title>' : '';
      const html =
        '<html><head>' + title + '</head><body><script>FORBIDDENTOKEN</script><nav>navstuff</nav>' +
        '<p>' + ws.join(' ') + '</p><footer>footstuff</footer></body></html>';
      const v = extractPage(html);
      if (!v.ok) throw new Error('expected ok at sweep ' + i);
      expect(v.page.wordCount).toBe(n);
      expect(v.page.text).toBe(ws.join(' '));
      expect(v.page.text.includes('FORBIDDENTOKEN')).toBe(false);
      expect(v.page.text.includes('navstuff')).toBe(false);
      expect(v.page.text.includes('footstuff')).toBe(false);
      expect(v.page.title).toBe(withTitle ? 'Sweep ' + i : null);
      expect(extractPage(html)).toEqual(v);
    }
  });
});
