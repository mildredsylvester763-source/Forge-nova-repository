// ============================================================================
// FILE: /apps/api/src/modules/quotes/engine/quote-lifecycle.ts
// ============================================================================
// Pure quote lifecycle math: expiry projection and the transition state
// machine. No database, no clock — "now" is passed in. Expired is derived
// from validUntil, never set by hand, exactly like invoice overdue.

import { QuoteStatus } from '../entities/quote.entity';
import { LineItemInput } from '../../invoices/engine/invoice-math';
import { QuoteLineItem } from '../entities/quote.entity';

export function effectiveQuoteStatus(
  status: QuoteStatus,
  now: Date,
  validUntil?: Date | null,
): QuoteStatus {
  if (status !== QuoteStatus.SENT) {
    return status;
  }
  if (validUntil && now.getTime() > validUntil.getTime()) {
    return QuoteStatus.EXPIRED;
  }
  return status;
}

export function canTransitionQuote(
  from: QuoteStatus,
  to: QuoteStatus,
): { allowed: boolean; reason: string } {
  if (from === to) {
    return { allowed: false, reason: 'quote is already ' + from };
  }
  if (from === QuoteStatus.DECLINED) {
    return { allowed: false, reason: 'a declined quote is final' };
  }
  if (from === QuoteStatus.EXPIRED) {
    return { allowed: false, reason: 'an expired quote is final — send a fresh quote' };
  }
  if (from === QuoteStatus.CONVERTED) {
    return { allowed: false, reason: 'a converted quote already became an invoice' };
  }
  if (to === QuoteStatus.EXPIRED) {
    return { allowed: false, reason: 'expired is derived from the valid-until date, never set by hand' };
  }
  if (to === QuoteStatus.CONVERTED) {
    return { allowed: false, reason: 'conversion happens through the convert endpoint, not a status change' };
  }
  if (from === QuoteStatus.DRAFT && to === QuoteStatus.ACCEPTED) {
    return { allowed: false, reason: 'send the quote before recording acceptance' };
  }
  if (from === QuoteStatus.DRAFT && to === QuoteStatus.DECLINED) {
    return { allowed: false, reason: 'send the quote before recording a decline' };
  }
  return { allowed: true, reason: from + ' -> ' + to };
}

/** Only an accepted quote can become an invoice. Everything else is refused with a reason. */
export function convertibleQuote(status: QuoteStatus): { allowed: boolean; reason: string } {
  if (status === QuoteStatus.ACCEPTED) {
    return { allowed: true, reason: 'accepted quote is ready to convert' };
  }
  return { allowed: false, reason: 'only accepted quotes convert; this quote is ' + status };
}

/** Maps stored quote lines to invoice line inputs. Pure identity — money math stays in invoice-math. */
export function quoteLinesToInvoiceLines(lineItems: QuoteLineItem[]): LineItemInput[] {
  return (lineItems ?? []).map((line) => ({
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
  }));
}
