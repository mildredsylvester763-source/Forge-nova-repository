// ============================================================================
// FILE: /apps/api/src/modules/goods-tracking/engine/damaged-engine.ts
// ============================================================================
// Pure damaged-goods rules. A write-off must be coverable by the real stock
// on hand; every refusal is named and leaves stock untouched.

export const MAX_DAMAGE_QTY = 1000000;

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export function validateDamageQty(raw: unknown): Verdict<number> {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return { ok: false, reason: 'damage-invalid-qty' };
  }
  if (raw > MAX_DAMAGE_QTY) {
    return { ok: false, reason: 'damage-qty-too-large' };
  }
  return { ok: true, value: raw };
}

export function validateDamageReason(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'damage-invalid-reason' };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    return { ok: false, reason: 'damage-invalid-reason' };
  }
  return { ok: true, value: trimmed };
}

export function validateDamageNote(raw: unknown): Verdict<string | null> {
  if (raw === null || raw === undefined) {
    return { ok: true, value: null };
  }
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'damage-invalid-note' };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1) {
    return { ok: true, value: null };
  }
  if (trimmed.length > 280) {
    return { ok: false, reason: 'damage-invalid-note' };
  }
  return { ok: true, value: trimmed };
}

export function planDamageWriteOff(onHand: number, qty: number): Verdict<number> {
  if (typeof onHand !== 'number' || !Number.isInteger(onHand) || onHand < 0) {
    return { ok: false, reason: 'damage-invalid-state' };
  }
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1) {
    return { ok: false, reason: 'damage-invalid-qty' };
  }
  if (qty > onHand) {
    return { ok: false, reason: 'damage-insufficient-stock' };
  }
  return { ok: true, value: onHand - qty };
}
