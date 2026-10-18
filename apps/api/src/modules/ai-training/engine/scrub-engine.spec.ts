// ============================================================================
// FILE: /apps/api/src/modules/ai-training/engine/scrub-engine.spec.ts
// ============================================================================
import {
  BLOCKED_TRAINING_CLASSES,
  checkClassificationEligibility,
  scrubText,
} from './scrub-engine';

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('scrub engine (FORGE AI-003/004)', () => {
  it('redacts email addresses destructively', () => {
    const r = scrubText({ text: 'contact jane.doe@example.com for details' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.scrubbed).not.toContain('jane.doe@example.com');
    expect(r.value.scrubbed).toContain('[REDACTED]');
    expect(r.value.findings.some((f) => f.kind === 'pii-email')).toBe(true);
  });

  it('redacts bearer tokens', () => {
    const r = scrubText({ text: 'Authorization: Bearer abc123def456' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.scrubbed).not.toContain('abc123def456');
  });

  it('redacts whole private key blocks before parts', () => {
    const r = scrubText({
      text: 'hello -----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----\nworld',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.scrubbed).not.toContain('MIIEow');
    expect(r.value.scrubbed).not.toContain('BEGIN RSA');
    expect(r.value.findings.some((f) => f.kind === 'secret-private-key-block')).toBe(true);
  });

  it('redacts SSNs', () => {
    const r = scrubText({ text: 'SSN 123-45-6789 on file' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.scrubbed).not.toContain('123-45-6789');
  });

  it('redacts Stripe-style live keys', () => {
    const r = scrubText({ text: 'key sk_live_abcdefghijklmnopqrst' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.scrubbed).not.toContain('sk_live_');
  });

  it('redacts JWTs', () => {
    const r = scrubText({
      text: 'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.scrubbed).not.toContain('eyJhbGci');
  });

  it('refuses empty text by name', () => {
    const r = scrubText({ text: '' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('scrub-empty-text');
  });

  it('refuses oversized text by name with the size quoted', () => {
    const r = scrubText({ text: 'a'.repeat(10), maxChars: 5 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('scrub-text-too-large:10');
  });

  it('clean text passes with zero findings', () => {
    const r = scrubText({ text: 'the quick brown fox jumps over the lazy dog' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.totalRedactions).toBe(0);
    expect(r.value.findings).toHaveLength(0);
    expect(r.value.eligible).toBe(true);
  });

  it('blocked classifications never enter training', () => {
    const r = checkClassificationEligibility({ classification: 'secret' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('classification-blocked:secret');
  });

  it('public classification is eligible', () => {
    const r = checkClassificationEligibility({ classification: 'public' });
    expect(r.ok).toBe(true);
  });

  it('refuses missing classification by name', () => {
    const r = checkClassificationEligibility({ classification: '' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('classification-missing');
  });

  it('500-sweep: every planted secret destroyed, no unexpected refusals', () => {
    const rnd = mulberry32(42);
    const secrets = [
      'jane@x.com',
      'Bearer tok_abc12345',
      '123-45-6789',
      'sk_live_abcdefghijklmnopqrst',
      'AKIAIOSFODNN7EXAMPLE',
      'api_key = "abcdefgh12345678"',
    ];
    let planted = 0;
    for (let s = 0; s < 500; s++) {
      const n = 1 + Math.floor(rnd() * 5);
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        if (rnd() > 0.5) {
          const sec = secrets[Math.floor(rnd() * secrets.length)];
          parts.push(sec);
          planted++;
        } else {
          parts.push('plain words ' + Math.floor(rnd() * 100));
        }
      }
      const r = scrubText({ text: parts.join(' and ') });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      for (const sec of secrets) {
        expect(r.value.scrubbed).not.toContain(sec);
      }
    }
    expect(planted).toBeGreaterThan(600);
  });

  it('blocked training classes are pinned', () => {
    expect(BLOCKED_TRAINING_CLASSES).toContain('secret');
    expect(BLOCKED_TRAINING_CLASSES).toContain('classified');
  });
});
