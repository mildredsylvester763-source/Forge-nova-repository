// ============================================================================
// FILE: /apps/api/src/modules/accounting/engine/ledger-posting.spec.ts
// ============================================================================
// Every invariant is pinned: journal balance, refusal reasons, the
// normal-balance convention, posting-rule cent-exactness, and the full
// invoice -> payment cycle closing Accounts Receivable to exactly zero.

import {
  AccountType,
  postCreditNoteIssued,
  postInvoiceIssued,
  postPaymentReceived,
  signedBalance,
  trialBalance,
  validateJournal,
} from './ledger-posting';

const IDS = {
  accountsReceivableId: 'ar',
  revenueId: 'rev',
  taxPayableId: 'tax',
  cashId: 'cash',
  returnsId: 'ret',
};

describe('validateJournal', () => {
  it('refuses empty, single-line, unbalanced, duplicate-account and zero-amount journals', () => {
    expect(validateJournal([]).ok).toBe(false);
    expect(validateJournal([{ accountId: 'a', side: 'debit', amountCents: 100 }]).ok).toBe(false);
    const unbalanced = validateJournal([
      { accountId: 'ar', side: 'debit', amountCents: 100 },
      { accountId: 'rev', side: 'credit', amountCents: 90 },
    ]);
    expect(unbalanced.ok).toBe(false);
    expect(unbalanced.reasons.some((r) => r.includes('must equal credits'))).toBe(true);
    const duplicate = validateJournal([
      { accountId: 'ar', side: 'debit', amountCents: 100 },
      { accountId: 'ar', side: 'credit', amountCents: 100 },
    ]);
    expect(duplicate.ok).toBe(false);
    expect(duplicate.reasons.some((r) => r.includes('more than once'))).toBe(true);
    const zero = validateJournal([
      { accountId: 'ar', side: 'debit', amountCents: 0 },
      { accountId: 'rev', side: 'credit', amountCents: 0 },
    ]);
    expect(zero.ok).toBe(false);
    expect(zero.reasons.some((r) => r.includes('positive'))).toBe(true);
  });

  it('accepts a balanced two-line journal and reports both totals', () => {
    const v = validateJournal([
      { accountId: 'ar', side: 'debit', amountCents: 110_000 },
      { accountId: 'rev', side: 'credit', amountCents: 110_000 },
    ]);
    expect(v.ok).toBe(true);
    expect(v.debitCents).toBe(110_000);
    expect(v.creditCents).toBe(110_000);
  });
});

describe('signedBalance normal-balance convention', () => {
  it('is debit-normal for assets and expenses, credit-normal for the rest', () => {
    expect(signedBalance('asset' as AccountType, 500, 200)).toBe(300);
    expect(signedBalance('expense' as AccountType, 400, 100)).toBe(300);
    expect(signedBalance('liability' as AccountType, 200, 500)).toBe(300);
    expect(signedBalance('equity' as AccountType, 0, 900)).toBe(900);
    expect(signedBalance('revenue' as AccountType, 0, 1000)).toBe(1000);
  });
});

describe('posting rules', () => {
  it('posts a taxed invoice as DR AR / CR Revenue / CR Tax Payable, cent-exact', () => {
    const lines = postInvoiceIssued(
      { subtotalCents: 100_000, taxCents: 10_000, totalCents: 110_000 },
      IDS,
    );
    expect(lines).toHaveLength(3);
    const v = validateJournal(lines);
    expect(v.ok).toBe(true);
    expect(v.debitCents).toBe(110_000);
  });

  it('skips the tax line entirely for a zero-tax invoice', () => {
    const lines = postInvoiceIssued(
      { subtotalCents: 100_000, taxCents: 0, totalCents: 100_000 },
      IDS,
    );
    expect(lines).toHaveLength(2);
    expect(validateJournal(lines).ok).toBe(true);
  });

  it('posts payments and credit notes balanced', () => {
    expect(validateJournal(postPaymentReceived(110_000, IDS)).ok).toBe(true);
    expect(validateJournal(postCreditNoteIssued(25_000, IDS)).ok).toBe(true);
  });
});

describe('full cycle: invoice then payment closes receivables to zero', () => {
  it('nets AR to 0 and lands the money in cash, revenue and tax payable', () => {
    const accounts = [
      { id: 'ar', code: '1100', type: 'asset' as AccountType },
      { id: 'rev', code: '4000', type: 'revenue' as AccountType },
      { id: 'tax', code: '2100', type: 'liability' as AccountType },
      { id: 'cash', code: '1010', type: 'asset' as AccountType },
    ];
    const lines = [
      ...postInvoiceIssued({ subtotalCents: 100_000, taxCents: 10_000, totalCents: 110_000 }, IDS),
      ...postPaymentReceived(110_000, IDS),
    ];
    const tb = trialBalance(accounts, lines);
    expect(tb.balanced).toBe(true);
    expect(tb.rows.find((r) => r.accountId === 'ar')!.balanceCents).toBe(0);
    expect(tb.rows.find((r) => r.accountId === 'cash')!.balanceCents).toBe(110_000);
    expect(tb.rows.find((r) => r.accountId === 'rev')!.balanceCents).toBe(100_000);
    expect(tb.rows.find((r) => r.accountId === 'tax')!.balanceCents).toBe(10_000);
  });
});

describe('500-journal seeded sweep', () => {
  it('balances every random journal and closes every trial balance', () => {
    function mulberry32(seed: number) {
      let a = seed >>> 0;
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const rnd = mulberry32(31337);
    const types: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];
    for (let i = 0; i < 500; i++) {
      const n = 1 + Math.floor(rnd() * 4);
      let total = 0;
      const debitLines = Array.from({ length: n }, (_, j) => {
        const amt = 1 + Math.floor(rnd() * 100_000);
        total += amt;
        return { accountId: 'acc' + j, side: 'debit' as const, amountCents: amt };
      });
      const journal = [...debitLines, { accountId: 'sink', side: 'credit' as const, amountCents: total }];
      const verdict = validateJournal(journal);
      expect(verdict.ok).toBe(true);
      const again = validateJournal(journal);
      expect(again.debitCents).toBe(verdict.debitCents);
      const accs = journal.map((l, idx) => ({
        id: l.accountId,
        code: String(1000 + idx),
        type: types[Math.floor(rnd() * 5)],
      }));
      const tb = trialBalance(accs, journal);
      expect(tb.balanced).toBe(true);
      expect(tb.totalDebitCents).toBe(total);
    }
  });
});
