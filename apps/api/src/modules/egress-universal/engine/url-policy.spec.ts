// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/url-policy.spec.ts
// ============================================================================
import {
  normalizeTarget,
  checkIpv4Literal,
  checkIpv6Literal,
  normalizeIpv4Bypass,
  ipv4ToInt,
} from './url-policy';

describe('url-policy (SSRF wall)', () => {
  it('accepts a plain public https URL', () => {
    const v = normalizeTarget('https://api.example.com/v1/data?x=1');
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.host).toBe('api.example.com');
      expect(v.value.port).toBe(443);
      expect(v.value.scheme).toBe('https');
    }
  });

  it('accepts an explicit 443 port', () => {
    expect(normalizeTarget('https://api.example.com:443/x').ok).toBe(true);
  });

  it('accepts a public IPv4 literal', () => {
    const v = normalizeTarget('https://8.8.8.8/dns');
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.host).toBe('8.8.8.8');
  });

  it('refuses http scheme by name', () => {
    const v = normalizeTarget('http://api.example.com');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('url-scheme-not-allowed:http');
  });

  it('refuses non-443 ports', () => {
    const v = normalizeTarget('https://api.example.com:8443/x');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('url-port-not-allowed:8443');
  });

  it('refuses localhost-style hostnames', () => {
    const v = normalizeTarget('https://localhost/x');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('url-local-hostname');
  });

  it('refuses private and metadata IPv4 ranges by name', () => {
    const cases: Array<[string, string]> = [
      ['https://127.0.0.1/x', 'url-loopback-address'],
      ['https://10.0.0.5/x', 'url-private-address'],
      ['https://192.168.1.1/x', 'url-private-address'],
      ['https://172.16.0.1/x', 'url-private-address'],
      ['https://169.254.169.254/latest/meta-data', 'url-link-local-address'],
      ['https://0.0.0.0/x', 'url-unspecified-address'],
    ];
    for (const [url, reason] of cases) {
      const v = normalizeTarget(url);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toBe(reason);
    }
  });

  it('refuses hex/octal/decimal SSRF bypass encodings', () => {
    const cases: Array<[string, string]> = [
      ['https://0x7f.0.0.1/x', 'url-loopback-address'],
      ['https://2130706433/x', 'url-loopback-address'],
      ['https://0177.0.0.1/x', 'url-loopback-address'],
      ['https://0x7f000001/x', 'url-loopback-address'],
    ];
    for (const [url, reason] of cases) {
      const v = normalizeTarget(url);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toBe(reason);
    }
  });

  it('normalizes public encoded literals through the URL parser to dotted quad', () => {
    // Node's WHATWG URL collapses 0x01020304 to 1.2.3.4 before we see the
    // host; encoded literals that land in PUBLIC space are therefore accepted
    // as their normalized public dotted quad (private/loopback ones refuse).
    const v = normalizeTarget('https://0x01020304/x');
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.host).toBe('1.2.3.4');
  });

  it('refuses IPv6 loopback, link-local, ULA and mapped-private literals', () => {
    const cases: Array<[string, string]> = [
      ['https://[::1]/x', 'url-loopback-address'],
      ['https://[fe80::1]/x', 'url-link-local-address'],
      ['https://[fd12::1]/x', 'url-private-address'],
      ['https://[::ffff:127.0.0.1]/x', 'url-loopback-address'],
    ];
    for (const [url, reason] of cases) {
      const v = normalizeTarget(url);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toBe(reason);
    }
  });

  it('accepts public IPv6 literals', () => {
    expect(normalizeTarget('https://[2620:0:2d0:200::7]/x').ok).toBe(true);
    expect(normalizeTarget('https://[::ffff:8.8.8.8]/x').ok).toBe(true);
  });

  it('refuses userinfo and fragments', () => {
    const a = normalizeTarget('https://user:pass@api.example.com/x');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('url-userinfo-forbidden');
    const b = normalizeTarget('https://api.example.com/x#frag');
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('url-fragment-forbidden');
  });

  it('normalizes bypass encodings to dotted quad', () => {
    const a = normalizeIpv4Bypass('0x7f000001');
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.value).toBe('127.0.0.1');
    const b = normalizeIpv4Bypass('0x7f.0.0.1');
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.value).toBe('127.0.0.1');
    const c = normalizeIpv4Bypass('0177.0.0.1');
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.value).toBe('127.0.0.1');
  });

  it('refuses non-bypass hosts in the normalizer', () => {
    const v = normalizeIpv4Bypass('example.com');
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('url-not-a-bypass-encoding');
  });

  it('ipv4ToInt and literal checks behave', () => {
    expect(ipv4ToInt('1.2.3.4')).toBe(16909060);
    expect(checkIpv4Literal('8.8.8.8').ok).toBe(true);
    const lo = checkIpv4Literal('127.0.0.1');
    expect(lo.ok).toBe(false);
    if (!lo.ok) expect(lo.reason).toBe('url-loopback-address');
    expect(checkIpv6Literal('::1').ok).toBe(false);
    expect(checkIpv6Literal('2600::').ok).toBe(true);
  });

  it('never throws on any input (invariant sweep)', () => {
    const rnd = (() => {
      let a = 42;
      return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();
    const hosts = ['example.com', '127.0.0.1', '10.1.0.1', '169.254.169.254', 'api.test.org'];
    for (let k = 0; k < 500; k++) {
      const h = hosts[Math.floor(rnd() * hosts.length)];
      const p = ['', ':443', ':8443'][Math.floor(rnd() * 3)];
      const scheme = rnd() < 0.7 ? 'https' : 'http';
      const v = normalizeTarget(scheme + '://' + h + p + '/x');
      expect(typeof v.ok).toBe('boolean');
      if (!v.ok) expect(v.reason.startsWith('url-')).toBe(true);
      if (v.ok) expect(v.value.scheme).toBe('https');
    }
  });
});
