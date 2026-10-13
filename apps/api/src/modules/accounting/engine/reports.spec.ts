// ============================================================================
// FILE: /apps/api/src/modules/accounting/engine/reports.spec.ts
// ============================================================================
// Pinned full-cycle statements plus a 500-journal balance sweep.

import { AccountType, LedgerAccount } from '../entities/ledger-account.entity';
import { JournalEntry, JournalLine } from '../entities/journal-entry.entity';
import { buildBalanceSheet, buildCashFlow, buildProfitAndLoss } from './reports';

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function account(code: string, name: string, type: AccountType): LedgerAccount {
  return { id: 'a-' + code, code, name, type } as LedgerAccount;
}

function journal(sourceType: string, lines: [string, 'debit' | 'credit', number][]): JournalEntry {
  return {
    sourceType,
    lines: lines.map(([accountCode, side, amountCents]) => ({ accountCode, side, amountCents } as JournalLine)),
    occurredAt: new Date(),
  } as JournalEntry;
}

describe('full-cycle pinned statements', () => {
  const accounts = [
    account('1010', 'Cash', AccountType.ASSET),
    account('1100', 'Accounts Receivable', AccountType.ASSET),
    account('2100', 'Sales Tax Payable', AccountType.LIABILITY),
    account('3000', "Owner's Equity", AccountType.EQUITY),
    account('4000', 'Sales Revenue', AccountType.REVENUE),
    account('4900', 'Sales Returns and Allowances', AccountType.EXPENSE),
    account('6000', 'Operating Expenses', AccountType.EXPENSE),
  ];
  const journals = [
    journal('invoice_issued', [
      ['1100', 'debit', 10000],
      ['4000', 'credit', 9091],
      ['2100', 'credit', 909],
    ]),
    journal('invoice_payment', [
      ['1010', 'debit', 10000],
      ['1100', 'credit', 10000],
    ]),
    journal('credit_note_issued', [
      ['4900', 'debit', 1000],
      ['1100', 'credit', 1000],
    ]),
    journal('expense', [
      ['6000', 'debit', 2500],
      ['1010', 'credit', 2500],
    ]),
  ];

  it('computes the pinned P&L', () => {
    const pl = buildProfitAndLoss(accounts, journals);
    expect(pl.revenueTotalCents).toBe(9091);
    expect(pl.expenseTotalCents).toBe(3500);
    expect(pl.netIncomeCents).toBe(5591);
  });

  it('balances the pinned balance sheet (A = L + E)', () => {
    const bs = buildBalanceSheet(accounts, journals);
    expect(bs.assetsTotalCents).toBe(6500); // cash 7500 + AR at credit balance -1000
    expect(bs.liabilitiesTotalCents).toBe(909);
    expect(bs.equityTotalCents).toBe(5591);
    expect(bs.balancesCents).toBe(0);
  });

  it('computes the pinned cash flow by source', () => {
    const cf = buildCashFlow(journals, ['1010']);
    expect(cf.netCashCents).toBe(7500);
    expect(cf.bySource['invoice_payment']).toBe(10000);
    expect(cf.bySource['expense']).toBe(-2500);
  });
});

describe('500-journal seeded sweep', () => {
  it('never breaks A = L + E on random balanced journals', () => {
    const rnd = mulberry32(42);
    const accounts = [
      account('1010', 'Cash', AccountType.ASSET),
      account('1100', 'Accounts Receivable', AccountType.ASSET),
      account('2100', 'Sales Tax Payable', AccountType.LIABILITY),
      account('3000', "Owner's Equity", AccountType.EQUITY),
      account('4000', 'Sales Revenue', AccountType.REVENUE),
      account('4900', 'Sales Returns and Allowances', AccountType.EXPENSE),
      account('6000', 'Operating Expenses', AccountType.EXPENSE),
    ];
    const codes = ['1010', '1100', '2100', '3000', '4000', '4900', '6000'];
    for (let i = 0; i < 500; i++) {
      const amount = 1 + Math.floor(rnd() * 100000);
      const d = codes[Math.floor(rnd() * codes.length)];
      const c = codes[Math.floor(rnd() * codes.length)];
      const journals = [
        journal('manual', [
          [d, 'debit', amount],
          [c, 'credit', amount],
        ]),
      ];
      const bs = buildBalanceSheet(accounts, journals);
      expect(bs.balancesCents).toBe(0);
      const pl = buildProfitAndLoss(accounts, journals);
      expect(pl.revenueTotalCents - pl.expenseTotalCents).toBe(pl.netIncomeCents);
    }
  });
});
