import {
  domainMatches,
  evaluateDomain,
  findOverlap,
  isValidDomainPattern,
  normalizeHost,
  validateRuleList,
} from './domain-policy';

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

describe('domain-policy engine (FORGE AI-061)', () => {
  it('normalizes hosts: scheme, path, port, userinfo and trailing dots are stripped', () => {
    expect(normalizeHost('https://Example.COM:443/path?q=1')).toBe('example.com');
    expect(normalizeHost('user@pass.host.io')).toBe('pass.host.io');
    expect(normalizeHost('trailing.dot.io.')).toBe('trailing.dot.io');
    expect(normalizeHost('')).toBe('');
  });

  it('bare domain matches the host and any subdomain, wildcard matches subdomains only', () => {
    expect(domainMatches('example.com', 'example.com')).toBe(true);
    expect(domainMatches('www.example.com', 'example.com')).toBe(true);
    expect(domainMatches('notexample.com', 'example.com')).toBe(false);
    expect(domainMatches('www.example.com', '*.example.com')).toBe(true);
    expect(domainMatches('example.com', '*.example.com')).toBe(false);
  });

  it('deny wins over allow and every refusal is named', () => {
    expect(
      evaluateDomain('ads.example.com', {
        allow: ['example.com'],
        deny: ['ads.example.com'],
      }),
    ).toEqual({ ok: false, reason: 'domain-denied:ads.example.com' });
    expect(
      evaluateDomain('good.example.com', {
        allow: ['example.com'],
        deny: ['ads.example.com'],
      }),
    ).toEqual({ ok: true });
    expect(
      evaluateDomain('other.org', { allow: ['example.com'], deny: [] }),
    ).toEqual({ ok: false, reason: 'domain-not-allowlisted:other.org' });
    expect(evaluateDomain('', { allow: [], deny: [] })).toEqual({
      ok: false,
      reason: 'domain-empty-host',
    });
    expect(evaluateDomain('bad host!', { allow: [], deny: [] })).toEqual({
      ok: false,
      reason: 'domain-invalid-host:bad host!',
    });
  });

  it('empty rules allow everything', () => {
    expect(evaluateDomain('any.site.io', { allow: [], deny: [] })).toEqual({ ok: true });
  });

  it('pattern validation refuses invalid, duplicate and empty entries by name', () => {
    expect(isValidDomainPattern('*.example.com')).toBe(true);
    expect(isValidDomainPattern('localhost')).toBe(false);
    expect(validateRuleList(['example.com', '*.news.io'])).toBeNull();
    expect(validateRuleList(['bad_pattern.com'])).toBe('rules-invalid-domain:bad_pattern.com');
    expect(validateRuleList(['example.com', 'example.com'])).toBe(
      'rules-duplicate-domain:example.com',
    );
    expect(validateRuleList([''])).toBe('rules-empty-domain');
    expect(validateRuleList('not-a-list' as unknown as string[])).toBe('rules-not-a-list');
    expect(findOverlap(['a.com', 'b.com'], ['b.com'])).toBe('b.com');
    expect(findOverlap(['a.com'], ['b.com'])).toBeNull();
  });

  it('500-case sweep: deny never passes, allow law holds, verdicts deterministic', () => {
    const rand = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const n = Math.floor(rand() * 20) + 1;
      const host = 'h' + n + '.example.org';
      const rules = {
        allow: rand() < 0.5 ? [] : ['example.org'],
        deny: rand() < 0.5 ? ['bad.example.org'] : [],
      };
      const v = evaluateDomain(host, rules);
      const denied = rules.deny.some((p) => domainMatches(host, p));
      expect(denied).toBe(!v.ok && (v.reason ?? '').startsWith('domain-denied:'));
      if (!denied) {
        const expected = rules.allow.length === 0 || domainMatches(host, 'example.org');
        expect(v.ok).toBe(expected);
      }
      expect(evaluateDomain(host, rules)).toEqual(v);
    }
  });
});
