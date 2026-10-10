// ============================================================================
// FILE: /apps/api/src/modules/accounting/engine/ledger-posting.ts
// ============================================================================
// Pure double-entry math. No database, no clock. Invariants enforced here
// and pinned by the spec:
//   1. Every journal balances: total debits == total credits, exactly.
//   2. Amounts are positive integer cents; a line for 0 does not exist.
//   3. Money must move between at least two different accounts.
//   4. Balances follow the normal-balance convention: assets and expenses
//      are debit-normal, liabilities, equity and revenue are credit-normal.
//   5. The trial balance always closes: sum of all debits == sum of all
//      credits across every journal ever posted.

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export function normalBalance(type: AccountType): 'debit' | 'credit' {
  return type === 'asset' || type === 'expense' ? 'debit' : 'credit';
}

export interface JournalLineInput {
  accountId: string;
  side: 'debit' | 'credit';
  amountCents: number;
}

export interface JournalValidation {
  ok: boolean;
  reasons: string[];
  debitCents: number;
  creditCents: number;
}

export function validateJournal(lines: JournalLineInput[]): JournalValidation {
  const reasons: string[] = [];
  if (!Array.isArray(lines) || lines.length < 2) {
    reasons.push('a journal needs at least two lines');
    return { ok: false, reasons, debitCents: 0, creditCents: 0 };
  }
  let debitCents = 0;
  let creditCents = 0;
  let hasDebit = false;
  let hasCredit = false;
  const seen = new Set<string>();
  for (const line of lines) {
    if (!line || typeof line.accountId !== 'string' || line.accountId.length === 0) {
      reasons.push('every line needs an account');
      continue;
    }
    if (!Number.isInteger(line.amountCents) || line.amountCents <= 0) {
      reasons.push('amounts must be positive integer cents');
      continue;
    }
    if (line.side !== 'debit' && line.side !== 'credit') {
      reasons.push('side must be debit or credit');
      continue;
    }
    if (seen.has(line.accountId)) {
      reasons.push('account ' + line.accountId + ' appears more than once');
      continue;
    }
    seen.add(line.accountId);
    if (line.side === 'debit') {
      debitCents += line.amountCents;
      hasDebit = true;
    } else {
      creditCents += line.amountCents;
      hasCredit = true;
    }
  }
  if (!hasDebit) reasons.push('a journal needs at least one debit line');
  if (!hasCredit) reasons.push('a journal needs at least one credit line');
  if (debitCents !== creditCents) {
    reasons.push('debits (' + debitCents + ') must equal credits (' + creditCents + ')');
  }
  if (seen.size < 2) reasons.push('money must move between at least two different accounts');
  return { ok: reasons.length === 0, reasons, debitCents, creditCents };
}

/** Signed balance under the normal-balance convention. */
export function signedBalance(
  type: AccountType,
  debitCents: number,
  creditCents: number,
): number {
  return normalBalance(type) === 'debit' ? debitCents - creditCents : creditCents - debitCents;
}

export interface TrialRow {
  accountId: string;
  accountCode: string;
  accountType: AccountType;
  debitCents: number;
  creditCents: number;
  balanceCents: number;
}

export interface TrialBalanceResult {
  rows: TrialRow[];
  totalDebitCents: number;
  totalCreditCents: number;
  balanced: boolean;
}

export function trialBalance(
  accounts: { id: string; code: string; type: AccountType }[],
  lines: { accountId: string; side: 'debit' | 'credit'; amountCents: number }[],
): TrialBalanceResult {
  const debit = new Map<string, number>();
  const credit = new Map<string, number>();
  for (const line of lines) {
    if (line.side === 'debit') {
      debit.set(line.accountId, (debit.get(line.accountId) ?? 0) + line.amountCents);
    } else {
      credit.set(line.accountId, (credit.get(line.accountId) ?? 0) + line.amountCents);
    }
  }
  const rows: TrialRow[] = accounts.map((account) => {
    const d = debit.get(account.id) ?? 0;
    const c = credit.get(account.id) ?? 0;
    return {
      accountId: account.id,
      accountCode: account.code,
      accountType: account.type,
      debitCents: d,
      creditCents: c,
      balanceCents: signedBalance(account.type, d, c),
    };
  });
  const totalDebitCents = rows.reduce((sum, row) => sum + row.debitCents, 0);
  const totalCreditCents = rows.reduce((sum, row) => sum + row.creditCents, 0);
  return { rows, totalDebitCents, totalCreditCents, balanced: totalDebitCents === totalCreditCents };
}

// ---------------------------------------------------------------------------
// Posting rules for the money-in wedge. Each returns balanced lines, quoted
// from the invoice's own cent-exact numbers — the ledger can never disagree
// with the invoice that produced it.
// ---------------------------------------------------------------------------

export interface PostingAccountIds {
  accountsReceivableId: string;
  revenueId: string;
  taxPayableId: string;
  cashId: string;
  returnsId: string;
}

export interface InvoiceLike {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

/** Invoice sent: DR Accounts Receivable, CR Revenue (+ CR Tax Payable when taxed). */
export function postInvoiceIssued(invoice: InvoiceLike, ids: PostingAccountIds): JournalLineInput[] {
  const lines: JournalLineInput[] = [
    { accountId: ids.accountsReceivableId, side: 'debit', amountCents: invoice.totalCents },
    { accountId: ids.revenueId, side: 'credit', amountCents: invoice.subtotalCents },
  ];
  if (invoice.taxCents > 0) {
    lines.push({ accountId: ids.taxPayableId, side: 'credit', amountCents: invoice.taxCents });
  }
  return lines;
}

/** Payment received: DR Cash, CR Accounts Receivable. */
export function postPaymentReceived(paymentCents: number, ids: PostingAccountIds): JournalLineInput[] {
  return [
    { accountId: ids.cashId, side: 'debit', amountCents: paymentCents },
    { accountId: ids.accountsReceivableId, side: 'credit', amountCents: paymentCents },
  ];
}

/** Credit note issued: DR Sales Returns, CR Accounts Receivable. */
export function postCreditNoteIssued(amountCents: number, ids: PostingAccountIds): JournalLineInput[] {
  return [
    { accountId: ids.returnsId, side: 'debit', amountCents },
    { accountId: ids.accountsReceivableId, side: 'credit', amountCents },
  ];
}
