// ============================================================================
// Pure credit-limit engine. No IO, no framework: every decision about a
// customer credit account (limit changes, charges, releases) is made here
// with named refusals, so it is fully testable with pinned vectors and a
// 500-case randomized sweep.
// ============================================================================

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const MAX_CREDIT_CENTS = 100000000; // one million dollars in cents
export const MAX_REASON_LENGTH = 200;

export function validateLimit(limitCents: number): Verdict<number> {
  if (!Number.isFinite(limitCents)) return { ok: false, reason: 'credit-invalid-limit' };
  if (!Number.isInteger(limitCents)) return { ok: false, reason: 'credit-invalid-limit' };
  if (limitCents < 0) return { ok: false, reason: 'credit-invalid-limit' };
  if (limitCents > MAX_CREDIT_CENTS) return { ok: false, reason: 'credit-limit-too-large' };
  return { ok: true, value: limitCents };
}

export function validateReason(reason: string): Verdict<string> {
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    return { ok: false, reason: 'credit-invalid-reason' };
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return { ok: false, reason: 'credit-reason-too-long' };
  }
  return { ok: true, value: reason };
}

export interface ChargeInput {
  limitCents: number;
  usedCents: number;
  chargeCents: number;
}

export interface ChargePlan {
  remainingCents: number;
  usedAfterCents: number;
}

export function decideCharge(input: ChargeInput): Verdict<ChargePlan> {
  const { limitCents, usedCents, chargeCents } = input;
  if (!Number.isFinite(limitCents) || !Number.isInteger(limitCents) || limitCents < 0) {
    return { ok: false, reason: 'credit-invalid-limit' };
  }
  if (!Number.isFinite(usedCents) || !Number.isInteger(usedCents) || usedCents < 0) {
    return { ok: false, reason: 'credit-invalid-used' };
  }
  if (!Number.isFinite(chargeCents) || !Number.isInteger(chargeCents) || chargeCents <= 0) {
    return { ok: false, reason: 'credit-invalid-charge' };
  }
  if (usedCents > limitCents) return { ok: false, reason: 'credit-used-exceeds-limit' };
  if (usedCents + chargeCents > limitCents) {
    return { ok: false, reason: 'credit-charge-exceeds-limit' };
  }
  return {
    ok: true,
    value: {
      remainingCents: limitCents - usedCents - chargeCents,
      usedAfterCents: usedCents + chargeCents,
    },
  };
}

export interface ReleaseInput {
  usedCents: number;
  releaseCents: number;
}

export function decideRelease(input: ReleaseInput): Verdict<{ usedAfterCents: number }> {
  const { usedCents, releaseCents } = input;
  if (!Number.isFinite(usedCents) || !Number.isInteger(usedCents) || usedCents < 0) {
    return { ok: false, reason: 'credit-invalid-used' };
  }
  if (!Number.isFinite(releaseCents) || !Number.isInteger(releaseCents) || releaseCents <= 0) {
    return { ok: false, reason: 'credit-invalid-release' };
  }
  if (releaseCents > usedCents) return { ok: false, reason: 'credit-release-exceeds-used' };
  return { ok: true, value: { usedAfterCents: usedCents - releaseCents } };
}

export interface LimitChangeInput {
  currentLimitCents: number;
  usedCents: number;
  newLimitCents: number;
}

export function decideLimitChange(input: LimitChangeInput): Verdict<{ limitAfterCents: number }> {
  const limitVerdict = validateLimit(input.newLimitCents);
  if (!limitVerdict.ok) return limitVerdict;
  if (!Number.isFinite(input.usedCents) || !Number.isInteger(input.usedCents) || input.usedCents < 0) {
    return { ok: false, reason: 'credit-invalid-used' };
  }
  if (input.newLimitCents < input.usedCents) {
    return { ok: false, reason: 'credit-limit-below-used' };
  }
  return { ok: true, value: { limitAfterCents: input.newLimitCents } };
}
