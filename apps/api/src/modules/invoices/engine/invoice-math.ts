// ============================================================================
// FILE: /apps/api/src/modules/invoices/engine/invoice-math.ts
// ============================================================================
// Pure invoice arithmetic. No database, no clock, no network — every number
// that lands on an invoice is decided here and pinned by the spec: cent-exact
// line totals, basis-point tax, named refusal of invalid lines, and the
// draft → sent → paid/void state machine. Invalid input is counted and
// quoted, never silently faked.

import { InvoiceStatus } from '../enums';

export interface LineItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CostedLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotalCents: number;
}

export interface InvalidLine {
  index: number;
  reason: string;
}

export interface InvoiceTotals {
  lineItems: CostedLineItem[];
  invalidLines: InvalidLine[];
  subtotalCents: number;
  taxRateBp: number;
  taxCents: number;
  totalCents: number;
}

const DAY_MS = 86_400_000;

/** Net payment terms: how many days of grace a customer gets. */
export const DEFAULT_NET_DAYS = 30;

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function computeTotals(items: LineItemInput[], taxRateBp = 0): InvoiceTotals {
  const lineItems: CostedLineItem[] = [];
  const invalidLines: InvalidLine[] = [];

  (items ?? []).forEach((item, index) => {
    const description = typeof item?.description === 'string' ? item.description.trim() : '';
    if (!description) {
      invalidLines.push({ index, reason: 'missing description' });
      return;
    }
    if (!finiteNumber(item?.quantity) || item.quantity <= 0) {
      invalidLines.push({ index, reason: 'quantity must be a positive number' });
      return;
    }
    if (!finiteNumber(item?.unitPrice) || item.unitPrice < 0) {
      invalidLines.push({ index, reason: 'unit price must be a non-negative number' });
      return;
    }
    const unitPriceCents = Math.round(item.unitPrice * 100);
    lineItems.push({
      description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotalCents: Math.round(item.quantity * unitPriceCents),
    });
  });

  const subtotalCents = lineItems.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const safeTaxRateBp = finiteNumber(taxRateBp) && taxRateBp >= 0 ? Math.round(taxRateBp) : 0;
  const taxCents = Math.round((subtotalCents * safeTaxRateBp) / 10_000);
  return {
    lineItems,
    invalidLines,
    subtotalCents,
    taxRateBp: safeTaxRateBp,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}

export function dueDateFor(issueDate: Date, netDays: number): Date {
  const days = finiteNumber(netDays) && netDays >= 0 ? Math.round(netDays) : DEFAULT_NET_DAYS;
  return new Date(issueDate.getTime() + days * DAY_MS);
}

/**
 * Overdue is a projection, not a status anyone sets by hand: a sent invoice
 * becomes overdue the instant the clock passes its due date — unless it has
 * been paid. Draft, paid and void invoices never flip on their own.
 */
export function effectiveStatus(
  status: InvoiceStatus,
  now: Date,
  dueDate: Date | undefined,
  paidAt: Date | undefined,
): InvoiceStatus {
  if (
    status === InvoiceStatus.PAID ||
    status === InvoiceStatus.VOID ||
    status === InvoiceStatus.DRAFT
  ) {
    return status;
  }
  if (!paidAt && dueDate && now.getTime() > dueDate.getTime()) {
    return InvoiceStatus.OVERDUE;
  }
  return status;
}

export function canTransition(
  from: InvoiceStatus,
  to: InvoiceStatus,
): { allowed: boolean; reason: string } {
  if (from === to) {
    return { allowed: false, reason: 'invoice is already ' + from };
  }
  if (from === InvoiceStatus.PAID) {
    return { allowed: false, reason: 'a paid invoice is final' };
  }
  if (from === InvoiceStatus.VOID) {
    return { allowed: false, reason: 'a voided invoice is final' };
  }
  if (to === InvoiceStatus.PAID && from === InvoiceStatus.DRAFT) {
    return { allowed: false, reason: 'send the invoice before recording a payment' };
  }
  if (to === InvoiceStatus.OVERDUE) {
    return { allowed: false, reason: 'overdue is derived from the due date, never set by hand' };
  }
  return { allowed: true, reason: from + ' → ' + to };
}
