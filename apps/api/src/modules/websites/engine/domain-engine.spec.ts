import {
  challengeHost,
  planSetPrimary,
  validateDomainName,
  verificationToken,
  verifyTokenMatch,
} from './domain-engine';

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

// The token oracle recomputes FNV-1a with BigInt so the multiplication is
// exact, an independent path from the engine Math.imul implementation.

function fnvOracleHex(input: string): string {
  let h = 2166136261n;
  const prime = 16777619n;
  const mask = 4294967295n;
  for (let i = 0; i < input.length; i += 1) {
    h = h ^ BigInt(input.charCodeAt(i));
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(8, '0');
}

describe('domain-engine (pinned vectors)', () => {
  it('validates domain names by name', () => {
    expect(validateDomainName('  Shop.MildredNg.COM  ')).toEqual({ ok: true, value: 'shop.mildredng.com' });
    expect(validateDomainName('localhost')).toEqual({ ok: false, reason: 'domain-invalid-name' });
    expect(validateDomainName('https://shop.com')).toEqual({ ok: false, reason: 'domain-invalid-name' });
    expect(validateDomainName('www.shop.com')).toEqual({ ok: false, reason: 'domain-invalid-name' });
    expect(validateDomainName('shop-.com')).toEqual({ ok: false, reason: 'domain-invalid-name' });
    expect(validateDomainName('-shop.com')).toEqual({ ok: false, reason: 'domain-invalid-name' });
    expect(validateDomainName('sh op.com')).toEqual({ ok: false, reason: 'domain-invalid-name' });
    expect(validateDomainName(12)).toEqual({ ok: false, reason: 'domain-invalid-name' });
  });

  it('builds deterministic challenge tokens and hosts', () => {
    const token = verificationToken('user-1', 'shop.com');
    expect(token.startsWith('forge-site-verify-')).toBe(true);
    expect(token).toBe(verificationToken('user-1', 'shop.com'));
    expect(token).not.toBe(verificationToken('user-2', 'shop.com'));
    expect(challengeHost('shop.com')).toBe('_forge-challenge.shop.com');
  });

  it('matches verification tokens exactly and gates the primary', () => {
    const token = verificationToken('user-1', 'shop.com');
    expect(verifyTokenMatch(token, token)).toEqual({ ok: true, value: true });
    expect(verifyTokenMatch(token, token + 'x')).toEqual({ ok: false, reason: 'domain-verification-mismatch' });
    expect(verifyTokenMatch(token, 3)).toEqual({ ok: false, reason: 'domain-verification-mismatch' });
    expect(planSetPrimary(null)).toEqual({ ok: false, reason: 'domain-not-found' });
    expect(planSetPrimary({ status: 'pending' })).toEqual({ ok: false, reason: 'domain-not-verified' });
    expect(planSetPrimary({ status: 'verified' })).toEqual({ ok: true, value: true });
  });
});

describe('domain-engine (500-case sweep, seed 42)', () => {
  it('domain verdicts match a label-by-label oracle', () => {
    const rng = mulberry32(42);
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789- .';
    const rand = (n: number) => {
      let s = '';
      for (let i = 0; i < n; i += 1) {
        s += chars[Math.floor(rng() * chars.length)];
      }
      return s;
    };
    const oracle = (d: string) => {
      if (d.length < 4 || d.length > 253) {
        return false;
      }
      if (d.startsWith('www.') || d.startsWith('http://') || d.startsWith('https://')) {
        return false;
      }
      const labels = d.split('.');
      if (labels.length < 2) {
        return false;
      }
      for (const label of labels) {
        if (label.length < 1 || label.length > 63) {
          return false;
        }
        if (label.startsWith('-') || label.endsWith('-')) {
          return false;
        }
        for (let i = 0; i < label.length; i += 1) {
          const c = label[i];
          const okChar = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '-';
          if (!okChar) {
            return false;
          }
        }
      }
      return true;
    };
    for (let i = 0; i < 500; i += 1) {
      const raw = rand(2 + Math.floor(rng() * 14)) + (rng() < 0.8 ? '.' + rand(2 + Math.floor(rng() * 6)) : '');
      expect(validateDomainName(raw).ok).toBe(oracle(raw.trim().toLowerCase()));
    }
  });

  it('tokens match the BigInt FNV oracle exactly', () => {
    const rng = mulberry32(42);
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const rand = (n: number) => {
      let s = '';
      for (let i = 0; i < n; i += 1) {
        s += chars[Math.floor(rng() * chars.length)];
      }
      return s;
    };
    for (let i = 0; i < 500; i += 1) {
      const userId = rand(6);
      const domain = rand(4) + '.com';
      expect(verificationToken(userId, domain)).toBe(
        'forge-site-verify-' + fnvOracleHex(userId + '|' + domain),
      );
    }
  });
});
