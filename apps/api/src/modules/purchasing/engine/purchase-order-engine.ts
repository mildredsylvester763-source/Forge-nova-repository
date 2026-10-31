// ============================================================================
// Pure purchase-order engine. Follows the PO lifecycle the SMB inventory
// market (Zoho Inventory, inFlow, QuickBooks, Sortly) ships: a draft with
// SKU lines and quantities, send to the supplier, partial or full receipts
// that push real stock, and cancellation that is blocked once anything has
// been received. Every refusal is named; quantities never go negative.
// ============================================================================

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export const PO_DAY_MS = 24 * 3600 * 1000;
export const PO_MAX_LINES = 100;
export const PO_MAX_QTY = 1000000;
export const PO_MAX_UNIT_COST_CENTS = 999999999;
export const PO_MAX_TOTAL_CENTS = 99999999999;

export type PoStatus = 'draft' | 'sent' | 'partially-received' | 'received' | 'cancelled';

export interface PoLineInput {
  sku: string;
  qty: number;
  unitCostCents: number;
}

export interface PoLinePlan {
  sku: string;
  qty: number;
  unitCostCents: number;
  lineTotalCents: number;
}

export function validatePoSku(sku: unknown): Verdict<string> {
  if (typeof sku !== 'string') return { ok: false, reason: 'po-invalid-sku' };
  const trimmed = sku.trim();
  if (trimmed.length < 1 || trimmed.length > 64) return { ok: false, reason: 'po-invalid-sku' };
  return { ok: true, value: trimmed };
}

export function validatePoQty(qty: unknown): Verdict<number> {
  if (!Number.isInteger(qty) || qty < 1 || qty > PO_MAX_QTY) {
    return { ok: false, reason: 'po-invalid-qty' };
  }
  return { ok: true, value: qty as number };
}

export function validatePoUnitCost(cost: unknown): Verdict<number> {
  if (!Number.isInteger(cost) || cost < 0 || cost > PO_MAX_UNIT_COST_CENTS) {
    return { ok: false, reason: 'po-invalid-cost' };
  }
  return { ok: true, value: cost as number };
}

export interface PoPlan {
  lines: PoLinePlan[];
  totalCents: number;
  expectedAtMs: number;
}

export function planPurchaseOrder(
  leadTimeDays: number,
  nowMs: number,
  lines: PoLineInput[],
): Verdict<PoPlan> {
  if (!Number.isInteger(leadTimeDays) || leadTimeDays < 0 || leadTimeDays > 365) {
    return { ok: false, reason: 'po-invalid-lead-time' };
  }
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, reason: 'po-empty' };
  if (lines.length > PO_MAX_LINES) return { ok: false, reason: 'po-too-many-lines' };
  const seen = new Set<string>();
  const planned: PoLinePlan[] = [];
  let totalCents = 0;
  for (const line of lines) {
    const sku = validatePoSku(line && line.sku);
    if (!sku.ok) return sku;
    if (seen.has(sku.value)) return { ok: false, reason: 'po-duplicate-sku' };
    seen.add(sku.value);
    const qty = validatePoQty(line && line.qty);
    if (!qty.ok) return qty;
    const cost = validatePoUnitCost(line && line.unitCostCents);
    if (!cost.ok) return cost;
    const lineTotal = qty.value * cost.value;
    totalCents += lineTotal;
    if (totalCents > PO_MAX_TOTAL_CENTS) return { ok: false, reason: 'po-total-too-large' };
    planned.push({ sku: sku.value, qty: qty.value, unitCostCents: cost.value, lineTotalCents: lineTotal });
  }
  return {
    ok: true,
    value: { lines: planned, totalCents, expectedAtMs: nowMs + leadTimeDays * PO_DAY_MS },
  };
}

export function canSendPo(status: PoStatus): Verdict<true> {
  if (status === 'draft') return { ok: true, value: true };
  return { ok: false, reason: 'po-invalid-transition' };
}

// Cancellation: a draft can always be cancelled; a sent order with no
// receipts yet can be cancelled; anything with receipts cannot, and a
// finished or already-cancelled order has no meaningful cancellation.
export function canCancelPo(status: PoStatus, receivedTotal: number): Verdict<true> {
  if (status === 'draft') return { ok: true, value: true };
  if (status === 'cancelled' || status === 'received') {
    return { ok: false, reason: 'po-invalid-transition' };
  }
  if (!Number.isInteger(receivedTotal) || receivedTotal < 0) {
    return { ok: false, reason: 'po-invalid-state' };
  }
  if (receivedTotal > 0) return { ok: false, reason: 'po-cancel-after-receipt' };
  if (status === 'partially-received') return { ok: false, reason: 'po-invalid-state' };
  return { ok: true, value: true };
}

export interface ReceiptResult {
  newReceivedQty: number;
  statusAfter: PoStatus;
}

// One receipt against one line. The line-level statusAfter only reflects
// that single line; the order-level status must be aggregated across all
// lines with aggregatePoStatus.
export function receivePoLine(
  status: PoStatus,
  orderedQty: number,
  alreadyReceivedQty: number,
  qty: number,
): Verdict<ReceiptResult> {
  if (status === 'cancelled') return { ok: false, reason: 'po-cancelled' };
  if (status !== 'sent' && status !== 'partially-received') {
    return { ok: false, reason: 'po-status-not-receivable' };
  }
  const validQty = validatePoQty(qty);
  if (!validQty.ok) return validQty;
  if (!Number.isInteger(orderedQty) || orderedQty < 1) {
    return { ok: false, reason: 'po-invalid-state' };
  }
  if (!Number.isInteger(alreadyReceivedQty) || alreadyReceivedQty < 0) {
    return { ok: false, reason: 'po-invalid-state' };
  }
  if (alreadyReceivedQty >= orderedQty) return { ok: false, reason: 'po-already-received' };
  const newReceivedQty = alreadyReceivedQty + validQty.value;
  if (newReceivedQty > orderedQty) return { ok: false, reason: 'po-over-receive' };
  return {
    ok: true,
    value: {
      newReceivedQty,
      statusAfter: newReceivedQty === orderedQty ? 'received' : 'partially-received',
    },
  };
}

// Order-level truth: an order is received only when EVERY line is full.
export function aggregatePoStatus(lines: Array<{ qty: number; receivedQty: number }>): Verdict<PoStatus> {
  if (!Array.isArray(lines) || lines.length === 0) return { ok: false, reason: 'po-invalid-state' };
  let ordered = 0;
  let received = 0;
  for (const line of lines) {
    if (
      !Number.isInteger(line.qty) ||
      !Number.isInteger(line.receivedQty) ||
      line.receivedQty < 0 ||
      line.receivedQty > line.qty
    ) {
      return { ok: false, reason: 'po-invalid-state' };
    }
    ordered += line.qty;
    received += line.receivedQty;
  }
  return { ok: true, value: received >= ordered ? 'received' : 'partially-received' };
}
