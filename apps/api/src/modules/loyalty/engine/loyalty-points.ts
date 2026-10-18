// ============================================================================
// FILE: /apps/api/src/modules/loyalty/engine/loyalty-points.ts
// ============================================================================
// The loyalty points engine: pure money-to-points and points-to-money
// decisions. Every limit is pinned and every refusal is named. The service
// owns the database; this file owns the arithmetic and the rules.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const EARN_UNIT_CENTS = 100;
export const EARN_POINTS_PER_UNIT = 1;
export const REDEEM_CENTS_PER_POINT = 1;
export const MAX_EARN_CENTS = 10000000;
export const MAX_REDEEM_POINTS = 1000000;
export const MAX_REASON_LENGTH = 200;

export function accruePoints(amountCents: unknown, reason: unknown): Verdict<{ points: number }> {
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents)) {
    return { ok: false, reason: 'loyalty-invalid-amount' };
  }
  if (amountCents < EARN_UNIT_CENTS) {
    return { ok: false, reason: 'loyalty-amount-too-small' };
  }
  if (amountCents > MAX_EARN_CENTS) {
    return { ok: false, reason: 'loyalty-amount-too-large' };
  }
  if (typeof reason !== 'string' || !reason.trim().length) {
    return { ok: false, reason: 'loyalty-invalid-reason' };
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return { ok: false, reason: 'loyalty-reason-length' };
  }
  const points = Math.floor(amountCents / EARN_UNIT_CENTS) * EARN_POINTS_PER_UNIT;
  return { ok: true, value: { points } };
}

export function redeemPoints(
  balance: unknown,
  points: unknown,
  reason: unknown,
): Verdict<{ valueCents: number; balanceAfter: number }> {
  if (typeof balance !== 'number' || !Number.isInteger(balance) || balance < 0) {
    return { ok: false, reason: 'loyalty-invalid-balance' };
  }
  if (typeof points !== 'number' || !Number.isInteger(points) || points < 1) {
    return { ok: false, reason: 'loyalty-invalid-points' };
  }
  if (points > MAX_REDEEM_POINTS) {
    return { ok: false, reason: 'loyalty-points-too-large' };
  }
  if (typeof reason !== 'string' || !reason.trim().length) {
    return { ok: false, reason: 'loyalty-invalid-reason' };
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return { ok: false, reason: 'loyalty-reason-length' };
  }
  if (points > balance) {
    return { ok: false, reason: 'loyalty-insufficient-points' };
  }
  return {
    ok: true,
    value: { valueCents: points * REDEEM_CENTS_PER_POINT, balanceAfter: balance - points },
  };
}

export function grantPoints(
  balance: unknown,
  points: unknown,
  reason: unknown,
): Verdict<{ balanceAfter: number }> {
  if (typeof balance !== 'number' || !Number.isInteger(balance) || balance < 0) {
    return { ok: false, reason: 'loyalty-invalid-balance' };
  }
  if (typeof points !== 'number' || !Number.isInteger(points) || points < 1) {
    return { ok: false, reason: 'loyalty-invalid-points' };
  }
  if (points > MAX_REDEEM_POINTS) {
    return { ok: false, reason: 'loyalty-points-too-large' };
  }
  if (typeof reason !== 'string' || !reason.trim().length) {
    return { ok: false, reason: 'loyalty-invalid-reason' };
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return { ok: false, reason: 'loyalty-reason-length' };
  }
  return { ok: true, value: { balanceAfter: balance + points } };
}
