// ============================================================================
// Pure barcode engine. Follows the barcode handling the inventory market
// ships (Zoho Inventory, Sortly, inFlow, Square): EAN-13 and UPC-A retail
// codes with a real mod-10 checksum, plus free-form Code 128 style codes
// for internal use. A 12 digit EAN-13 base gets its check digit completed,
// an 11 digit UPC-A base does too, and a full 13 digit code must already
// carry a correct checksum. Every refusal is named.
// ============================================================================

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const BARCODE_MAX = 48;

// Mod-10 check digit over a 12 digit base (odd positions weight 1, even
// positions weight 3, the standard EAN-13 weighting).
export function computeCheckDigit(base12: string): number {
  let sum = 0;
  for (let i = 0; i < base12.length; i++) {
    const d = base12.charCodeAt(i) - 48;
    sum += d * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export function normalizeBarcode(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') return { ok: false, reason: 'barcode-invalid-format' };
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > BARCODE_MAX) return { ok: false, reason: 'barcode-invalid-format' };
  if (/^[0-9]+$/.test(trimmed)) {
    if (trimmed.length === 13) {
      const expected = computeCheckDigit(trimmed.slice(0, 12));
      if (trimmed.charCodeAt(12) - 48 !== expected) return { ok: false, reason: 'barcode-bad-checksum' };
      return { ok: true, value: trimmed };
    }
    if (trimmed.length === 12) {
      return { ok: true, value: trimmed + String(computeCheckDigit(trimmed)) };
    }
    if (trimmed.length === 11) {
      // A UPC-A base is an EAN-13 with a leading zero.
      return { ok: true, value: trimmed + String(computeCheckDigit('0' + trimmed)) };
    }
    return { ok: false, reason: 'barcode-invalid-format' };
  }
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed.charCodeAt(i);
    if (c < 32 || c > 126) return { ok: false, reason: 'barcode-invalid-format' };
  }
  return { ok: true, value: trimmed };
}
