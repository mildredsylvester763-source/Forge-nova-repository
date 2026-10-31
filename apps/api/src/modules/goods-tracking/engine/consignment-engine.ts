// ============================================================================
// FILE: /apps/api/src/modules/goods-tracking/engine/consignment-engine.ts
// ============================================================================
// Pure consignment rules. Consignors hand over stock they still own; sales
// split into commission for the shop and payout owed to the consignor;
// returns hand unsold stock back. Every refusal is named.

export const MAX_CONSIGNMENT_QTY = 1000000;
export const MAX_CONSIGNMENT_PRICE_CENTS = 100000000;

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export function validateConsignorName(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'consignor-invalid-name' };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 80) {
    return { ok: false, reason: 'consignor-invalid-name' };
  }
  return { ok: true, value: trimmed };
}

export function validateConsignmentSku(raw: unknown): Verdict<string> {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'consignment-invalid-sku' };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 64) {
    return { ok: false, reason: 'consignment-invalid-sku' };
  }
  return { ok: true, value: trimmed };
}

export function validateCommissionPct(raw: unknown): Verdict<number> {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0 || raw > 100) {
    return { ok: false, reason: 'consignor-invalid-commission' };
  }
  return { ok: true, value: raw };
}

export function validateConsignmentQty(raw: unknown): Verdict<number> {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return { ok: false, reason: 'consignment-invalid-qty' };
  }
  if (raw > MAX_CONSIGNMENT_QTY) {
    return { ok: false, reason: 'consignment-qty-too-large' };
  }
  return { ok: true, value: raw };
}

export function validateConsignmentPrice(raw: unknown): Verdict<number> {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return { ok: false, reason: 'consignment-invalid-price' };
  }
  if (raw > MAX_CONSIGNMENT_PRICE_CENTS) {
    return { ok: false, reason: 'consignment-price-too-large' };
  }
  return { ok: true, value: raw };
}

export interface ConsignmentEconomics {
  totalCents: number;
  commissionCents: number;
  payoutCents: number;
}

// Commission is rounded half-up on the whole sale: total times pct over 100.
export function consignmentEconomics(
  qty: number,
  unitPriceCents: number,
  commissionPct: number,
): Verdict<ConsignmentEconomics> {
  if (
    typeof qty !== 'number' ||
    typeof unitPriceCents !== 'number' ||
    typeof commissionPct !== 'number' ||
    !Number.isInteger(qty) ||
    qty < 1 ||
    unitPriceCents < 1 ||
    commissionPct < 0 ||
    commissionPct > 100
  ) {
    return { ok: false, reason: 'consignment-invalid-price' };
  }
  const totalCents = qty * unitPriceCents;
  const commissionCents = Math.round((totalCents * commissionPct) / 100);
  return { ok: true, value: { totalCents, commissionCents, payoutCents: totalCents - commissionCents } };
}

export function planConsignmentTake(onConsignment: number, qty: number): Verdict<number> {
  if (typeof onConsignment !== 'number' || !Number.isInteger(onConsignment) || onConsignment < 0) {
    return { ok: false, reason: 'consignment-invalid-state' };
  }
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1) {
    return { ok: false, reason: 'consignment-invalid-qty' };
  }
  if (qty > onConsignment) {
    return { ok: false, reason: 'consignment-insufficient-stock' };
  }
  return { ok: true, value: onConsignment - qty };
}
