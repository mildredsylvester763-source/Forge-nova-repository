// ============================================================================
// FILE: /apps/api/src/modules/accounting/engine/reports.ts
// ============================================================================
// Pure financial statements built from immutable journals. The fundamental
// invariant: Assets = Liabilities + Equity (including current-period earnings).
// Every builder returns balancesCents, which must always be 0.

import { AccountType } from '../entities/ledger-account.entity';
import { JournalEntry } from '../entities/journal-entry.entity';

export interface ReportAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
}

export interface ReportLine {
  code: string;
  name: string;
  amountCents: number;
}

export function netByCode(journals: JournalEntry[]): Record<string, number> {
  const net: Record<string, number> = {};
  for (const journal of journals) {
    for (const line of journal.lines) {
      net[line.accountCode] = net[line.accountCode] || 0;
      net[line.accountCode] += line.side === 'debit' ? line.amountCents : -line.amountCents;
    }
  }
  return net;
}

export interface ProfitAndLoss {
  revenue: ReportLine[];
  expenses: ReportLine[];
  revenueTotalCents: number;
  expenseTotalCents: number;
  netIncomeCents: number;
}

export function buildProfitAndLoss(accounts: ReportAccount[], journals: JournalEntry[]): ProfitAndLoss {
  const net = netByCode(journals);
  const revenue = accounts
    .filter((a) => a.type === AccountType.REVENUE)
    .map((a) => ({ code: a.code, name: a.name, amountCents: -(net[a.code] || 0) }))
    .filter((x) => x.amountCents !== 0);
  const expenses = accounts
    .filter((a) => a.type === AccountType.EXPENSE)
    .map((a) => ({ code: a.code, name: a.name, amountCents: net[a.code] || 0 }))
    .filter((x) => x.amountCents !== 0);
  const revenueTotal = revenue.reduce((s, x) => s + x.amountCents, 0);
  const expenseTotal = expenses.reduce((s, x) => s + x.amountCents, 0);
  return {
    revenue,
    expenses,
    revenueTotalCents: revenueTotal,
    expenseTotalCents: expenseTotal,
    netIncomeCents: revenueTotal - expenseTotal,
  };
}

export interface BalanceSheet {
  assets: ReportLine[];
  liabilities: ReportLine[];
  equity: ReportLine[];
  assetsTotalCents: number;
  liabilitiesTotalCents: number;
  equityTotalCents: number;
  /** Must always be 0: A = L + E is the ledger's ground truth. */
  balancesCents: number;
}

export function buildBalanceSheet(accounts: ReportAccount[], journals: JournalEntry[]): BalanceSheet {
  const pl = buildProfitAndLoss(accounts, journals);
  const net = netByCode(journals);
  const assets = accounts
    .filter((a) => a.type === AccountType.ASSET)
    .map((a) => ({ code: a.code, name: a.name, amountCents: net[a.code] || 0 }))
    .filter((x) => x.amountCents !== 0);
  const liabilities = accounts
    .filter((a) => a.type === AccountType.LIABILITY)
    .map((a) => ({ code: a.code, name: a.name, amountCents: -(net[a.code] || 0) }))
    .filter((x) => x.amountCents !== 0);
  const equityBase = accounts
    .filter((a) => a.type === AccountType.EQUITY)
    .map((a) => ({ code: a.code, name: a.name, amountCents: -(net[a.code] || 0) }))
    .filter((x) => x.amountCents !== 0);
  const assetsTotal = assets.reduce((s, x) => s + x.amountCents, 0);
  const liabilitiesTotal = liabilities.reduce((s, x) => s + x.amountCents, 0);
  const equityTotal = equityBase.reduce((s, x) => s + x.amountCents, 0) + pl.netIncomeCents;
  return {
    assets,
    liabilities,
    equity: [
      ...equityBase,
      { code: '9999', name: 'Current-period earnings', amountCents: pl.netIncomeCents },
    ],
    assetsTotalCents: assetsTotal,
    liabilitiesTotalCents: liabilitiesTotal,
    equityTotalCents: equityTotal,
    balancesCents: assetsTotal - liabilitiesTotal - equityTotal,
  };
}

export interface CashFlow {
  bySource: Record<string, number>;
  netCashCents: number;
}

export function buildCashFlow(journals: JournalEntry[], cashCodes: string[]): CashFlow {
  const flows: Record<string, number> = {};
  let total = 0;
  for (const journal of journals) {
    let delta = 0;
    for (const line of journal.lines) {
      if (cashCodes.includes(line.accountCode)) {
        delta += line.side === 'debit' ? line.amountCents : -line.amountCents;
      }
    }
    if (delta === 0) continue;
    flows[journal.sourceType] = (flows[journal.sourceType] || 0) + delta;
    total += delta;
  }
  return { bySource: flows, netCashCents: total };
}
