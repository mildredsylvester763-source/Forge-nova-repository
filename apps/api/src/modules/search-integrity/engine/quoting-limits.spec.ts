import { planQuotes, QUOTE_LICENSES } from './quoting-limits';

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('quoting-limits engine (FORGE AI-068)', () => {
  it('refuses missing license, unknown license and empty quotes with named reasons', () => {
    expect(planQuotes({ license: '', quotes: ['a'] })).toMatchObject({
      ok: false,
      reason: 'quote-license-missing',
    });
    expect(planQuotes({ license: 'gpl', quotes: ['a'] })).toMatchObject({
      ok: false,
      reason: 'quote-license-unknown:gpl',
    });
    expect(planQuotes({ license: 'cc0', quotes: [] })).toMatchObject({
      ok: false,
      reason: 'quotes-empty',
    });
    expect(planQuotes({ license: 'cc0', quotes: ['ok', '   '] })).toMatchObject({
      ok: false,
      reason: 'quote-text-missing',
    });
  });

  it('forbids verbatim quoting entirely for AI-excluding licenses', () => {
    expect(planQuotes({ license: 'no-ai', quotes: ['one two'] })).toMatchObject({
      ok: false,
      reason: 'quote-verbatim-forbidden:no-ai',
    });
  });

  it('caps quote count, quote words and total quoted words', () => {
    expect(planQuotes({ license: 'CC-BY', quotes: ['a', 'b', 'c', 'd'] })).toMatchObject({
      ok: false,
      reason: 'quote-count-exceeded:4:3',
    });
    const longWords = Array(51).fill('w').join(' ');
    expect(planQuotes({ license: 'cc0', quotes: [longWords] })).toMatchObject({
      ok: false,
      reason: 'quote-too-long:51:50',
    });
    const forty = Array(40).fill('w').join(' ');
    const sixty = Array(61).fill('w').join(' ');
    expect(planQuotes({ license: 'cc0', quotes: [forty, sixty] })).toMatchObject({
      ok: false,
      reason: 'quote-total-exceeded:101:100',
    });
  });

  it('plans legal quotes with normalized license and exact word counts', () => {
    const out = planQuotes({ license: 'Owned', quotes: ['one two three', 'four five'] });
    expect(out.ok).toBe(true);
    expect(out.license).toBe('owned');
    expect(out.quotedWords).toBe(5);
    expect(out.quotes?.map((q) => q.words)).toEqual([3, 2]);
  });

  it('matches an independent oracle on 500 mulberry32(42) cases', () => {
    const rand = mulberry32(42);
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
    for (let c = 0; c < 500; c++) {
      const license = pick(QUOTE_LICENSES.filter((l) => l !== 'no-ai'));
      const qn = 1 + Math.floor(rand() * 4);
      const quotes: string[] = [];
      for (let q = 0; q < qn; q++) {
        const wn = 1 + Math.floor(rand() * 60);
        quotes.push(Array(wn).fill('q').join(' '));
      }
      const got = planQuotes({ license, quotes });
      let total = 0;
      let expectOk = true;
      let expectReason = '';
      if (qn > 3) {
        expectOk = false;
        expectReason = 'quote-count-exceeded:' + qn + ':3';
      } else {
        for (const q of quotes) {
          const wn = q.split(/\s+/).filter(Boolean).length;
          if (wn > 50) {
            expectOk = false;
            expectReason = 'quote-too-long:' + wn + ':50';
            break;
          }
          total += wn;
          if (total > 100) {
            expectOk = false;
            expectReason = 'quote-total-exceeded:' + total + ':100';
            break;
          }
        }
      }
      expect(got.ok).toBe(expectOk);
      if (expectOk) {
        expect(got.quotedWords).toBe(total);
      } else {
        expect(got.reason).toBe(expectReason);
      }
    }
  });
});
