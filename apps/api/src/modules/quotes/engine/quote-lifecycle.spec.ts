// ============================================================================
// FILE: /apps/api/src/modules/quotes/engine/quote-lifecycle.spec.ts
// ============================================================================
// Pinned expiry boundary, every transition refusal, and conversion gating.

import { QuoteStatus } from '../entities/quote.entity';
import {
  canTransitionQuote,
  convertibleQuote,
  effectiveQuoteStatus,
  quoteLinesToInvoiceLines,
} from './quote-lifecycle';

const U = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 12, 0, 0));

describe('effectiveQuoteStatus', () => {
  it('flips a sent quote to expired the moment validity passes', () => {
    const after = effectiveQuoteStatus(QuoteStatus.SENT, U(2026, 9, 10), U(2026, 9, 9));
    expect(after).toBe(QuoteStatus.EXPIRED);
    const before = effectiveQuoteStatus(QuoteStatus.SENT, U(2026, 9, 8), U(2026, 9, 9));
    expect(before).toBe(QuoteStatus.SENT);
  });

  it('never flips drafts, accepted or converted quotes on the clock', () => {
    for (const status of [QuoteStatus.DRAFT, QuoteStatus.ACCEPTED, QuoteStatus.CONVERTED]) {
      expect(effectiveQuoteStatus(status, U(2027, 0, 1), U(2026, 0, 1))).toBe(status);
    }
  });
});

describe('canTransitionQuote', () => {
  it('refuses no-ops, finals, derived states and premature acceptances', () => {
    expect(canTransitionQuote(QuoteStatus.SENT, QuoteStatus.SENT).allowed).toBe(false);
    expect(canTransitionQuote(QuoteStatus.DECLINED, QuoteStatus.SENT).allowed).toBe(false);
    expect(canTransitionQuote(QuoteStatus.EXPIRED, QuoteStatus.ACCEPTED).allowed).toBe(false);
    expect(canTransitionQuote(QuoteStatus.CONVERTED, QuoteStatus.SENT).allowed).toBe(false);
    expect(canTransitionQuote(QuoteStatus.SENT, QuoteStatus.EXPIRED).allowed).toBe(false);
    expect(canTransitionQuote(QuoteStatus.SENT, QuoteStatus.CONVERTED).allowed).toBe(false);
    expect(canTransitionQuote(QuoteStatus.DRAFT, QuoteStatus.ACCEPTED).allowed).toBe(false);
    expect(canTransitionQuote(QuoteStatus.DRAFT, QuoteStatus.DECLINED).allowed).toBe(false);
  });

  it('allows the honest paths with quoted reasons', () => {
    expect(canTransitionQuote(QuoteStatus.DRAFT, QuoteStatus.SENT).allowed).toBe(true);
    expect(canTransitionQuote(QuoteStatus.SENT, QuoteStatus.ACCEPTED).allowed).toBe(true);
    expect(canTransitionQuote(QuoteStatus.SENT, QuoteStatus.DECLINED).allowed).toBe(true);
  });
});

describe('convertibleQuote', () => {
  it('gates conversion on acceptance', () => {
    expect(convertibleQuote(QuoteStatus.ACCEPTED).allowed).toBe(true);
    expect(convertibleQuote(QuoteStatus.SENT).allowed).toBe(false);
    expect(convertibleQuote(QuoteStatus.DRAFT).allowed).toBe(false);
    expect(convertibleQuote(QuoteStatus.EXPIRED).allowed).toBe(false);
  });
});

describe('quoteLinesToInvoiceLines', () => {
  it('maps stored lines to invoice inputs unchanged', () => {
    const lines = quoteLinesToInvoiceLines([
      { description: 'consulting', quantity: 2, unitPrice: 150, lineTotalCents: 30000 },
    ]);
    expect(lines).toEqual([{ description: 'consulting', quantity: 2, unitPrice: 150 }]);
  });
});
