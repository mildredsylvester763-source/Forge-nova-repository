// ============================================================================
// FILE: /apps/api/src/modules/dunning-letters/engine/dunning-letter.ts
// ============================================================================
// Pure dunning letter composer. No database, no clock — everything (invoice
// snapshot, now, terms) is passed in. Tone escalates with the reminder stage;
// every refusal is named, never silent. Money is integer cents, formatted
// deterministically with a manual thousands separator (no Intl dependency).

const DAY_MS = 86_400_000;

export type LetterTone = 'gentle' | 'polite' | 'firm' | 'urgent' | 'final';

export interface LetterInvoiceSnapshot {
  status: 'draft' | 'sent' | 'overdue' | 'paid' | 'void';
  number: string;
  currency: string;
  totalCents: number;
  customerName?: string | null;
  dueDate?: Date | null;
  paidAt?: Date | null;
  daysOverdue: number;
  lateFeeCents: number;
  feeReason: string;
}

export interface LetterBranding {
  businessName?: string | null;
  senderName?: string | null;
}

export interface ComposedLetter {
  tone: LetterTone;
  subject: string;
  body: string;
  stageDue: Date;
  reason: string;
}

export interface LetterRefusal {
  refused: true;
  reason: string;
}

export function toneForStage(offsetDays: number): LetterTone {
  if (offsetDays < 0) return 'gentle';
  if (offsetDays === 0) return 'polite';
  if (offsetDays <= 7) return 'firm';
  if (offsetDays <= 30) return 'urgent';
  return 'final';
}

/** Deterministic money formatting: 150000 -> "USD 1,500.00". Pure string math. */
export function formatMoney(cents: number, currency: string): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(cents));
  const whole = Math.trunc(abs / 100).toString();
  const frac = (abs % 100).toString().padStart(2, '0');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (currency || 'USD') + ' ' + sign + grouped + '.' + frac;
}

export function composeLetter(
  invoice: LetterInvoiceSnapshot,
  offsetDays: number,
  branding: LetterBranding,
  now: Date,
): ComposedLetter | LetterRefusal {
  if (invoice.status === 'draft') {
    return { refused: true, reason: 'draft invoices are never sent dunning letters' };
  }
  if (invoice.status === 'paid' || invoice.paidAt) {
    return { refused: true, reason: 'a paid invoice owes nothing, no letter is sent' };
  }
  if (invoice.status === 'void') {
    return { refused: true, reason: 'a voided invoice owes nothing, no letter is sent' };
  }
  if (invoice.status !== 'sent' && invoice.status !== 'overdue') {
    return { refused: true, reason: invoice.status + ' invoices are not chased' };
  }
  if (!invoice.dueDate) {
    return { refused: true, reason: 'an invoice without a due date cannot enter the reminder ladder' };
  }
  if (!Number.isInteger(offsetDays)) {
    return { refused: true, reason: 'the reminder offset must be an integer day count' };
  }

  const stageDue = new Date(invoice.dueDate.getTime() + offsetDays * DAY_MS);
  if (now.getTime() < stageDue.getTime()) {
    return { refused: true, reason: 'reminder stage ' + offsetDays + ' day(s) has not been reached yet' };
  }

  const tone = toneForStage(offsetDays);
  const money = formatMoney(invoice.totalCents, invoice.currency);
  const feeLine =
    invoice.lateFeeCents > 0
      ? ' A late fee of ' + formatMoney(invoice.lateFeeCents, invoice.currency) + ' has been applied (' + invoice.feeReason + ').'
      : '';
  const customer = invoice.customerName || 'valued customer';
  const dueStr = invoice.dueDate.toISOString().slice(0, 10);
  const business = branding.businessName || 'our team';
  const sender = branding.senderName || 'Accounts';

  const openers: Record<LetterTone, string> = {
    gentle: 'a friendly heads-up',
    polite: 'a polite reminder',
    firm: 'a firm reminder',
    urgent: 'an urgent notice',
    final: 'a final notice',
  };
  const asks: Record<LetterTone, string> = {
    gentle: 'If anything is unclear about the invoice, just reply to this message.',
    polite: 'If payment has already been sent, please disregard this reminder.',
    firm: 'Please arrange payment at your earliest convenience.',
    urgent: 'Please treat this as a priority and settle the balance promptly.',
    final: 'This is our final reminder before this account is escalated for collection.',
  };

  const subject =
    offsetDays < 0
      ? '[Reminder] Invoice ' + invoice.number + ' is due on ' + dueStr
      : offsetDays === 0
        ? '[Reminder] Invoice ' + invoice.number + ' is due today (' + money + ')'
        : '[Overdue ' + offsetDays + ' days] Invoice ' + invoice.number + ' — ' + money + ' outstanding';

  const overdueLine =
    offsetDays > 0
      ? 'The invoice is now ' + invoice.daysOverdue + ' day(s) past due.'
      : 'The invoice falls due on the date above.';

  const body =
    'Hello ' + customer + ',\n\n' +
    'This is ' + openers[tone] + ' from ' + business + ' regarding invoice ' + invoice.number + '.\n' +
    'Amount: ' + money + '\n' +
    'Due date: ' + dueStr + '\n' +
    overdueLine + feeLine + '\n' +
    asks[tone] + '\n\n' +
    'Thank you,\n' + sender + '\n' + (branding.businessName || '');

  return { tone, subject, body, stageDue, reason: 'letter composed for stage ' + offsetDays };
}

export function isLetterRefusal(x: ComposedLetter | LetterRefusal): x is LetterRefusal {
  return (x as LetterRefusal).refused === true;
}
