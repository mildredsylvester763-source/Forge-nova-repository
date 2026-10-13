// ============================================================================
// FILE: /apps/api/src/modules/payments/engine/payment-allocation.ts
// ============================================================================
// Pure water-fill allocation: oldest due date first, no due date last, and a
// payment may never exceed the outstanding balance. Only the LAST allocation
// in the result may be partial — that single invariant catches most
// allocation-engine bugs. No clock, no DB: everything is passed in.

export type AllocationVerdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface AllocatableInvoice {
  id: string;
  number: string;
  totalCents: number;
  dueAt?: Date | string | null;
  status: string;
}

export interface Allocation {
  invoiceId: string;
  invoiceNumber: string;
  amountCents: number;
  fullyPaid: boolean;
}

export function allocatePayment(
  invoices: AllocatableInvoice[],
  amountCents: number,
): AllocationVerdict<{ allocations: Allocation[]; allocatedCents: number }> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, reason: 'payment amount must be a positive integer number of cents' };
  }
  const open = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue');
  if (open.length === 0) {
    return { ok: false, reason: 'nothing to allocate — the customer has no open invoices' };
  }
  const withTime = open.map((i) => ({
    inv: i,
    due: i.dueAt ? new Date(i.dueAt).getTime() : Number.POSITIVE_INFINITY,
  }));
  withTime.sort((a, b) => a.due - b.due || a.inv.number.localeCompare(b.inv.number));

  const allocations: Allocation[] = [];
  let remaining = amountCents;
  for (const { inv } of withTime) {
    if (remaining <= 0) break;
    const applied = Math.min(remaining, inv.totalCents);
    allocations.push({
      invoiceId: inv.id,
      invoiceNumber: inv.number,
      amountCents: applied,
      fullyPaid: applied >= inv.totalCents,
    });
    remaining -= applied;
  }
  if (remaining > 0) {
    return { ok: false, reason: 'payment exceeds the outstanding balance by ' + remaining + ' cents' };
  }
  return { ok: true, value: { allocations, allocatedCents: amountCents } };
}
