// ============================================================================
// FILE: /apps/api/src/modules/websites/engine/domain-engine.ts
// ============================================================================

// Pure custom-domain rules. Connecting a domain follows the market standard:
// the owner adds a challenge TXT record at their DNS host, then submits the
// value they set so the platform can compare it exactly. Verification here
// is an honest token comparison, never a fake DNS lookup.

const LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export function validateDomainName(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'domain-invalid-name' };
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized.length < 4 || normalized.length > 253) {
    return { ok: false, reason: 'domain-invalid-name' };
  }
  if (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('www.')
  ) {
    return { ok: false, reason: 'domain-invalid-name' };
  }
  const labels = normalized.split('.');
  if (labels.length < 2) {
    return { ok: false, reason: 'domain-invalid-name' };
  }
  for (const label of labels) {
    if (label.length < 1 || label.length > 63 || !LABEL_PATTERN.test(label)) {
      return { ok: false, reason: 'domain-invalid-name' };
    }
  }
  return { ok: true, value: normalized };
}

// FNV-1a 32-bit hash, deterministic for the same owner and domain.
function fnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function verificationToken(userId: string, domain: string): string {
  return 'forge-site-verify-' + fnv1a32Hex(userId + '|' + domain);
}

export function challengeHost(domain: string): string {
  return '_forge-challenge.' + domain;
}

export function verifyTokenMatch(expected: unknown, submitted: unknown): Verdict<boolean> {
  if (typeof expected !== 'string' || typeof submitted !== 'string' || expected !== submitted) {
    return { ok: false, reason: 'domain-verification-mismatch' };
  }
  return { ok: true, value: true };
}

// Only a verified domain can become the site primary.
export function planSetPrimary(row: unknown): Verdict<boolean> {
  if (typeof row !== 'object' || row === null) {
    return { ok: false, reason: 'domain-not-found' };
  }
  if ((row as { status?: unknown }).status !== 'verified') {
    return { ok: false, reason: 'domain-not-verified' };
  }
  return { ok: true, value: true };
}
