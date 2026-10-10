// ============================================================================
// FILE: /apps/api/src/modules/invoices/engine/invoice-dunning.ts
// ============================================================================
// Pure dunning math: overdue projection, grace windows, late fees and the
// reminder ladder. No database, no clock — `now` is always passed in by the
// service. Every refusal is named, never silent.

import { InvoiceStatus } from '../enums';
import { effectiveStatus } from './invoice-math';

const DAY_MS = 86_400_000;

export interface DunningTerms {
  /** Days after the due date before any fee starts accruing. */
  graceDays: number;
  /** Basis points of the invoice total per chargeable day (100 = 1%/day). */
  lateFeeBpPerDay: number;
  /** Flat cents per chargeable day. */
  lateFeeFlatCents: number;
  /** Hard cap in cents. Zero means uncapped. */
  lateFeeCapCents: number;
  /** Reminder offsets in days relative to the due date; negative = before. */
  reminderOffsets: number[];
}

export const DEFAULT_DUNNING_TERMS: DunningTerms = {
  graceDays: 3,
  lateFeeBpPerDay: 0,
  lateFeeFlatCents: 0,
  lateFeeCapCents: 0,
  reminderOffsets: [-3, 0, 7, 14, 30, 60],
};

export interface DunningInput {
  status: InvoiceStatus;
  totalCents: number;
  dueDate?: Date | null;
  paidAt?: Date | null;
}

export interface ReminderStage {
  offsetDays: number;
  label: string;
  dueOn: Date;
}

export interface DunningResult {
  effectiveStatus: InvoiceStatus;
  daysOverdue: number;
  inGrace: boolean;
  lateFeeCents: number;
  feeReason: string;
  reminders: ReminderStage[];
  futureReminders: ReminderStage[];
  reason: string;
}

export function computeDunning(
  input: DunningInput,
  terms: DunningTerms,
  now: Date,
): DunningResult {
  const eff = effectiveStatus(input.status, now, input.dueDate, input.paidAt);
  const chaseable = input.status === InvoiceStatus.SENT || input.status === InvoiceStatus.OVERDUE;
  const daysOverdue =
    chaseable && input.dueDate && !input.paidAt
      ? Math.max(0, Math.floor((now.getTime() - input.dueDate.getTime()) / DAY_MS))
      : 0;

  let lateFeeCents = 0;
  let feeReason: string;
  let inGrace = false;
  if (!chaseable) {
    feeReason =
      input.status === InvoiceStatus.DRAFT
        ? 'draft invoices are never charged late fees'
        : input.status === InvoiceStatus.PAID
          ? 'a paid invoice owes nothing'
          : 'a voided invoice owes nothing';
  } else if (daysOverdue === 0) {
    feeReason = 'not overdue yet';
  } else if (daysOverdue <= terms.graceDays) {
    inGrace = true;
    feeReason =
      'within the ' + terms.graceDays + '-day grace window (' + daysOverdue + ' day(s) overdue)';
  } else {
    const chargeable = daysOverdue - terms.graceDays;
    const bpFee = Math.round((input.totalCents * terms.lateFeeBpPerDay) / 10_000) * chargeable;
    const flatFee = terms.lateFeeFlatCents * chargeable;
    lateFeeCents = Math.max(bpFee, flatFee);
    if (terms.lateFeeCapCents > 0 && lateFeeCents > terms.lateFeeCapCents) {
      feeReason =
        'capped at ' + terms.lateFeeCapCents + ' cents (uncapped would be ' + lateFeeCents + ')';
      lateFeeCents = terms.lateFeeCapCents;
    } else {
      feeReason =
        bpFee >= flatFee
          ? terms.lateFeeBpPerDay + ' bp/day x ' + chargeable + ' chargeable day(s) on ' + input.totalCents + ' cents'
          : terms.lateFeeFlatCents + ' cents/day x ' + chargeable + ' chargeable day(s)';
    }
  }

  const reminders: ReminderStage[] = [];
  const futureReminders: ReminderStage[] = [];
  if (chaseable && input.dueDate) {
    for (const offset of [...terms.reminderOffsets].sort((a, b) => a - b)) {
      const dueOn = new Date(input.dueDate.getTime() + offset * DAY_MS);
      const stage: ReminderStage = {
        offsetDays: offset,
        label:
          offset < 0
            ? 'upcoming, ' + -offset + ' day(s) before due'
            : offset === 0
              ? 'due today'
              : 'overdue ' + offset + ' day(s)',
        dueOn,
      };
      if (now.getTime() >= dueOn.getTime()) {
        reminders.push(stage);
      } else {
        futureReminders.push(stage);
      }
    }
  }

  return {
    effectiveStatus: eff,
    daysOverdue,
    inGrace,
    lateFeeCents,
    feeReason,
    reminders,
    futureReminders,
    reason: chaseable
      ? daysOverdue > 0
        ? daysOverdue + ' day(s) overdue'
        : 'current, nothing overdue'
      : eff + ' invoices are not chased',
  };
}
