// ============================================================================
// Pure multi-location engine. Follows what multi-site inventory tools ship
// (Zoho Inventory, inFlow, Sortly, TradeGecko): named locations per owner,
// stock tracked per location and per SKU, and transfers between locations
// that refuse when the source cannot cover them. Stock never goes negative
// and never crosses an owner boundary. Every refusal is named.
// ============================================================================

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const LOCATION_NAME_MAX = 80;
export const LOCATION_SKU_MAX = 64;
export const LOCATION_MAX_QTY = 1000000;
export const LOCATION_MAX_TOTAL = 10000000;

export function validateLocationName(name: unknown): Verdict<string> {
  if (typeof name !== 'string') return { ok: false, reason: 'location-invalid-name' };
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > LOCATION_NAME_MAX) return { ok: false, reason: 'location-invalid-name' };
  return { ok: true, value: trimmed };
}

export function validateStockSku(sku: unknown): Verdict<string> {
  if (typeof sku !== 'string') return { ok: false, reason: 'location-invalid-sku' };
  const trimmed = sku.trim();
  if (trimmed.length < 1 || trimmed.length > LOCATION_SKU_MAX) return { ok: false, reason: 'location-invalid-sku' };
  return { ok: true, value: trimmed };
}

export function validateLocationQty(qty: unknown): Verdict<number> {
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > LOCATION_MAX_QTY) {
    return { ok: false, reason: 'location-invalid-qty' };
  }
  return { ok: true, value: qty };
}

export function planStockReceipt(currentOnHand: number, qty: unknown): Verdict<number> {
  const q = validateLocationQty(qty);
  if (!q.ok) return q;
  if (typeof currentOnHand !== 'number' || !Number.isInteger(currentOnHand) || currentOnHand < 0) {
    return { ok: false, reason: 'location-invalid-state' };
  }
  const next = currentOnHand + q.value;
  if (next > LOCATION_MAX_TOTAL) return { ok: false, reason: 'location-stock-too-large' };
  return { ok: true, value: next };
}

export interface TransferPlan {
  newFrom: number;
  newTo: number;
}

export function planStockTransfer(fromOnHand: number, toOnHand: number, qty: unknown): Verdict<TransferPlan> {
  const q = validateLocationQty(qty);
  if (!q.ok) return q;
  if (typeof fromOnHand !== 'number' || !Number.isInteger(fromOnHand) || fromOnHand < 0) {
    return { ok: false, reason: 'location-invalid-state' };
  }
  if (typeof toOnHand !== 'number' || !Number.isInteger(toOnHand) || toOnHand < 0) {
    return { ok: false, reason: 'location-invalid-state' };
  }
  if (fromOnHand < q.value) return { ok: false, reason: 'location-insufficient-stock' };
  const newTo = toOnHand + q.value;
  if (newTo > LOCATION_MAX_TOTAL) return { ok: false, reason: 'location-stock-too-large' };
  return { ok: true, value: { newFrom: fromOnHand - q.value, newTo } };
}
