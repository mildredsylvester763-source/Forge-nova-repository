// ============================================================================
// FILE: /apps/api/src/modules/taxes/engine/tax-filing.ts
// ============================================================================

// Period VAT position: output VAT collected minus input VAT paid.
// Positive means payable to the authority; negative means credit.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface FilingSummary {
  netVatCents: number;
  position: 'payable' | 'credit' | 'nil';
}

export function filingSummary(outputVatCents: number, inputVatCents: number, periodLabel: string): Verdict<FilingSummary> {
  if (outputVatCents < 0 || inputVatCents < 0) return { ok: false, reason: 'filing-negative-amount' };
  if (!periodLabel || !periodLabel.trim()) return { ok: false, reason: 'filing-empty-period' };
  const netVatCents = outputVatCents - inputVatCents;
  return {
    ok: true,
    value: {
      netVatCents,
      position: netVatCents > 0 ? 'payable' : netVatCents < 0 ? 'credit' : 'nil',
    },
  };
}
