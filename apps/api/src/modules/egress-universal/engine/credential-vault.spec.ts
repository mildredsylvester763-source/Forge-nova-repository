// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/credential-vault.spec.ts
// ============================================================================
import {
  buildEnvelope,
  parseEnvelope,
  fingerprintHex,
  redactCredentials,
  isSecretHeader,
} from './credential-vault';

const IV = 'a'.repeat(24);
const TAG = 'b'.repeat(32);
const CT = 'c'.repeat(40);
const ENV = 'v1:' + IV + ':' + TAG + ':' + CT;

describe('credential-vault (sealed envelope discipline)', () => {
  it('builds a v1:iv:tag:ct envelope', () => {
    const v = buildEnvelope(IV, TAG, CT);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.envelope).toBe(ENV);
  });

  it('refuses malformed envelope components by name', () => {
    const a = buildEnvelope('short', TAG, CT);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.reason).toBe('vault-invalid-iv');
    const b = buildEnvelope(IV, 'short', CT);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe('vault-invalid-tag');
    const c = buildEnvelope(IV, TAG, 'z');
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toBe('vault-invalid-ciphertext');
  });

  it('round-trips an envelope', () => {
    const v = parseEnvelope(ENV);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.ivHex).toBe(IV);
      expect(v.value.tagHex).toBe(TAG);
      expect(v.value.ciphertextHex).toBe(CT);
    }
  });

  it('refuses tampered envelopes', () => {
    const empty = parseEnvelope('');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason).toBe('vault-empty');
    const badVersion = parseEnvelope('v2:' + IV + ':' + TAG + ':' + CT);
    expect(badVersion.ok).toBe(false);
    if (!badVersion.ok) expect(badVersion.reason).toBe('vault-unknown-version:v2');
    const malformed = parseEnvelope('v1:' + IV + ':' + TAG);
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.reason).toBe('vault-malformed-envelope');
  });

  it('derives a 12-char display fingerprint', () => {
    const digest = 'a'.repeat(63) + 'b';
    const v = fingerprintHex(digest);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.fp).toBe(digest.slice(0, 12));
    expect(fingerprintHex('xyz').ok).toBe(false);
  });

  it('redacts credentials to fingerprints for logs', () => {
    const v = redactCredentials({ apiKey: 'sk-secret-123' }, { apiKey: '0a1b2c3d4e5f6a7b8c9d0e1f' });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.redacted.apiKey).toBe('fp:0a1b2c3d4e5f');
  });

  it('refuses redaction without a fingerprint', () => {
    const v = redactCredentials({ apiKey: 'x' }, {});
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe('vault-missing-fingerprint:apiKey');
  });

  it('classifies secret headers', () => {
    expect(isSecretHeader('Authorization')).toBe(true);
    expect(isSecretHeader('x-api-key')).toBe(true);
    expect(isSecretHeader('api-token')).toBe(true);
    expect(isSecretHeader('X-Custom')).toBe(false);
  });
});
