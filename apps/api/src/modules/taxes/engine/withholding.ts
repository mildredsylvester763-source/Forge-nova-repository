// ============================================================================
// FILE: /apps/api/src/modules/taxes/engine/withholding.ts
// ============================================================================

// Withholding tax by payment kind (Nigerian-style rates, basis points).
// Unknown kinds are named refusals — tax is never guessed.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface WithholdingResult {
  whtCents: number;
  netCents: number;
  rateBps: number;
}

const WHT_RATES: Record<string, number> = {
  'service': 1000,
  'rent': 1000,
  'royalty': 1000,
  'dividend': 1000,
  'contract': 500,
  'professional': 500,
};

export function computeWithholding(grossCents: number, kind: string): Verdict<WithholdingResult> {
  if (grossCents < 0) return { ok: false, reason: 'wht-negative-amount' };
  const rateBps = WHT_RATES[kind];
  if (rateBps === undefined) return { ok: false, reason: 'wht-unknown-kind:' + kind };
  const whtCents = Math.round((grossCents * rateBps) / 10000);
  return {
    ok: true,
    value: { whtCents, netCents: grossCents - whtCents, rateBps },
  };
}
