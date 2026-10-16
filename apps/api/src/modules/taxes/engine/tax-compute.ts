// ============================================================================
// FILE: /apps/api/src/modules/taxes/engine/tax-compute.ts
// ============================================================================

// VAT computation, exclusive or inclusive, in integer cents. The
// net + vat = gross identity holds for every verdict. Rates are basis
// points: 750 = 7.5%.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface VatBreakdown {
  netCents: number;
  vatCents: number;
  grossCents: number;
}

export function computeVat(amountCents: number, rateBps: number, mode: 'exclusive' | 'inclusive'): Verdict<VatBreakdown> {
  if (amountCents < 0) return { ok: false, reason: 'vat-negative-amount' };
  if (rateBps < 0 || rateBps > 10000) return { ok: false, reason: 'vat-invalid-rate' };
  if (mode === 'exclusive') {
    const vatCents = Math.round((amountCents * rateBps) / 10000);
    return {
      ok: true,
      value: { netCents: amountCents, vatCents, grossCents: amountCents + vatCents },
    };
  }
  const netCents = Math.round((amountCents * 10000) / (10000 + rateBps));
  return {
    ok: true,
    value: { netCents, vatCents: amountCents - netCents, grossCents: amountCents },
  };
}
