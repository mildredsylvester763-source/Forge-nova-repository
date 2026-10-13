// ============================================================================
// FILE: /apps/api/src/modules/receipts/engine/receipt-format.ts
// ============================================================================
// Pure receipt numbering and validation. No clock, no DB.

export type ReceiptVerdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export function formatReceiptNumber(seq: number): ReceiptVerdict<string> {
  if (!Number.isInteger(seq) || seq <= 0) {
    return { ok: false, reason: 'receipt sequence must be a positive integer' };
  }
  if (seq > 99999999) {
    return { ok: false, reason: 'receipt sequence out of range' };
  }
  return { ok: true, value: 'REC-' + String(seq).padStart(4, '0') };
}

export function validateReceiptInput(payment: {
  amountCents: number;
  receivedAt?: Date | null;
}): ReceiptVerdict<true> {
  if (!Number.isInteger(payment.amountCents) || payment.amountCents <= 0) {
    return { ok: false, reason: 'receipt needs a positive payment amount' };
  }
  if (!payment.receivedAt) {
    return { ok: false, reason: 'receipt needs the payment received date' };
  }
  return { ok: true, value: true };
}
