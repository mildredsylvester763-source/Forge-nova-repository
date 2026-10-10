// ============================================================================
// FILE: /apps/api/src/modules/credit-notes/engine/credit-allocation.ts
// ============================================================================
// Pure credit allocation: oldest-due-first water-fill over eligible
// invoices. Draft, paid and void invoices are skipped with named reasons,
// never silently absorbed. Conservation is exact — applied + remaining
// always equals the credit offered.

import { InvoiceStatus } from '../../invoices/enums';

export interface CreditCandidate {
  id: string;
  status: InvoiceStatus;
  totalCents: number;
  dueDate?: Date | null;
}

export interface CreditAllocation {
  invoiceId: string;
  appliedCents: number;
}

export interface AllocationResult {
  allocations: CreditAllocation[];
  remainingCents: number;
  appliedCents: number;
  skipped: { id: string; reason: string }[];
}

export function remainingCredit(amountCents: number, appliedCents: number): number {
  const amount = Number.isFinite(amountCents) ? Math.max(0, Math.round(amountCents)) : 0;
  const applied = Number.isFinite(appliedCents) ? Math.max(0, Math.round(appliedCents)) : 0;
  return Math.max(0, amount - applied);
}

export function allocateCredit(creditCents: number, candidates: CreditCandidate[]): AllocationResult {
  const skipped: { id: string; reason: string }[] = [];
  const eligible = candidates.filter((candidate) => {
    if (candidate.status === InvoiceStatus.DRAFT) {
      skipped.push({ id: candidate.id, reason: 'draft invoice has not been sent' });
      return false;
    }
    if (candidate.status === InvoiceStatus.PAID) {
      skipped.push({ id: candidate.id, reason: 'invoice is already paid' });
      return false;
    }
    if (candidate.status === InvoiceStatus.VOID) {
      skipped.push({ id: candidate.id, reason: 'voided invoice cannot absorb credit' });
      return false;
    }
    if (!(candidate.totalCents > 0)) {
      skipped.push({ id: candidate.id, reason: 'zero or negative total' });
      return false;
    }
    return true;
  });

  eligible.sort((a, b) => {
    const at = a.dueDate ? a.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
    const bt = b.dueDate ? b.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
    if (at !== bt) return at - bt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  let remaining = Math.max(0, Math.round(creditCents));
  const allocations: CreditAllocation[] = [];
  for (const candidate of eligible) {
    if (remaining === 0) break;
    const applied = Math.min(remaining, candidate.totalCents);
    allocations.push({ invoiceId: candidate.id, appliedCents: applied });
    remaining -= applied;
  }

  const appliedCents = Math.max(0, Math.round(creditCents)) - remaining;
  return { allocations, remainingCents: remaining, appliedCents, skipped };
}
