// ============================================================================
// FILE: /apps/api/src/modules/egress-universal/engine/credential-vault.ts
// ============================================================================
// Credential envelope discipline. Credentials are stored as an opaque
// sealed envelope — v1:<iv>:<tag>:<ciphertext> — with authenticated
// encryption done by Node crypto in the service. The engine pins the
// envelope grammar, tamper refusal, and redaction for logs. Plaintext
// never appears in a verdict other than encrypt's own input echo.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const ENVELOPE_PREFIX = 'v1';
const IV_HEX = /^[0-9a-f]{24}$/; // 12 bytes
const TAG_HEX = /^[0-9a-f]{32}$/; // 16 bytes
const CT_HEX = /^[0-9a-f]{2,}$/;

export interface SealedEnvelope {
  envelope: string;
}

export function buildEnvelope(ivHex: string, tagHex: string, ciphertextHex: string): Verdict<SealedEnvelope> {
  if (!IV_HEX.test(ivHex)) return { ok: false, reason: 'vault-invalid-iv' };
  if (!TAG_HEX.test(tagHex)) return { ok: false, reason: 'vault-invalid-tag' };
  if (!CT_HEX.test(ciphertextHex)) return { ok: false, reason: 'vault-invalid-ciphertext' };
  return { ok: true, value: { envelope: ENVELOPE_PREFIX + ':' + ivHex + ':' + tagHex + ':' + ciphertextHex } };
}

export interface EnvelopeParts {
  ivHex: string;
  tagHex: string;
  ciphertextHex: string;
}

export function parseEnvelope(envelope: string): Verdict<EnvelopeParts> {
  if (typeof envelope !== 'string' || !envelope.length) return { ok: false, reason: 'vault-empty' };
  const parts = envelope.split(':');
  if (parts.length !== 4) return { ok: false, reason: 'vault-malformed-envelope' };
  if (parts[0] !== ENVELOPE_PREFIX) return { ok: false, reason: 'vault-unknown-version:' + parts[0] };
  if (!IV_HEX.test(parts[1])) return { ok: false, reason: 'vault-invalid-iv' };
  if (!TAG_HEX.test(parts[2])) return { ok: false, reason: 'vault-invalid-tag' };
  if (!CT_HEX.test(parts[3])) return { ok: false, reason: 'vault-invalid-ciphertext' };
  return { ok: true, value: { ivHex: parts[1], tagHex: parts[2], ciphertextHex: parts[3] } };
}

// A display fingerprint: first 12 hex chars of the digest — enough to
// recognize a credential, impossible to recover it.
export function fingerprintHex(digestHex: string): Verdict<{ fp: string }> {
  if (typeof digestHex !== 'string' || !/^[0-9a-f]{64}$/.test(digestHex)) {
    return { ok: false, reason: 'vault-invalid-digest' };
  }
  return { ok: true, value: { fp: digestHex.slice(0, 12) } };
}

// Redacts a credentials record for logs and API echoes: every value
// becomes its fingerprint; keys survive.
export function redactCredentials(
  credentials: Record<string, string>,
  fingerprints: Record<string, string>,
): Verdict<{ redacted: Record<string, string> }> {
  if (!credentials || typeof credentials !== 'object') {
    return { ok: false, reason: 'vault-invalid-credentials' };
  }
  const redacted: Record<string, string> = {};
  for (const key of Object.keys(credentials)) {
    const fp = fingerprints[key];
    if (typeof fp !== 'string' || !/^[0-9a-f]{1,64}$/.test(fp)) {
      return { ok: false, reason: 'vault-missing-fingerprint:' + key };
    }
    redacted[key] = 'fp:' + fp.slice(0, 12);
  }
  return { ok: true, value: { redacted } };
}

// Which header names must never be logged in plaintext.
export function isSecretHeader(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n === 'authorization' ||
    n === 'x-api-key' ||
    n === 'x-auth-token' ||
    n === 'cookie' ||
    n.startsWith('x-forgenova-signature') ||
    n.endsWith('-token') ||
    n.endsWith('-secret')
  );
}
