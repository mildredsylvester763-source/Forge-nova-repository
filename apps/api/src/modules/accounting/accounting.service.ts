// ============================================================================
// FILE: /apps/api/src/modules/accounting/accounting.service.ts
// ============================================================================
// Zero-trust double-entry bookkeeping. Design laws:
//   - Balances are computed from immutable journals at read time; nothing
//     is ever stored as a mutable balance column.
//   - Journals post once: the (userId, idempotencyKey) pair is checked
//     before insert, and duplicate keys are refused, never overwritten.
//   - The posting rules quote the invoice's own cents, so the ledger and
//     the invoice can never disagree.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountType, LedgerAccount } from './entities/ledger-account.entity';
import { JournalEntry, JournalLine } from './entities/journal-entry.entity';
import { CreateJournalDto } from './dto/create-journal.dto';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceStatus } from '../invoices/enums';
import { CreditNote } from '../credit-notes/entities/credit-note.entity';
import {
  postCreditNoteIssued,
  postInvoiceIssued,
  postPaymentReceived,
  trialBalance,
  validateJournal,
} from './engine/ledger-posting';

/** The standard small-business chart seeded by POST /accounting/chart/seed. */
export const CHART_SEED: { code: string; name: string; type: AccountType }[] = [
  { code: '1010', name: 'Cash', type: AccountType.ASSET },
  { code: '1100', name: 'Accounts Receivable', type: AccountType.ASSET },
  { code: '2100', name: 'Sales Tax Payable', type: AccountType.LIABILITY },
  { code: '3000', name: "Owner's Equity", type: AccountType.EQUITY },
  { code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE },
  { code: '4900', name: 'Sales Returns and Allowances', type: AccountType.EXPENSE },
];

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(LedgerAccount)
    private readonly accountRepository: Repository<LedgerAccount>,
    @InjectRepository(JournalEntry)
    private readonly journalRepository: Repository<JournalEntry>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(CreditNote)
    private readonly noteRepository: Repository<CreditNote>,
  ) {}

  // ---------------- chart of accounts ----------------

  async seedChart(userId: string): Promise<{ created: LedgerAccount[]; skipped: string[] }> {
    const existing = await this.accountRepository.find({ where: { userId } });
    const codes = new Set(existing.map((a) => a.code));
    const created: LedgerAccount[] = [];
    const skipped: string[] = [];
    for (const seed of CHART_SEED) {
      if (codes.has(seed.code)) {
        skipped.push(seed.code + ' ' + seed.name);
        continue;
      }
      created.push(
        await this.accountRepository.save(
          this.accountRepository.create({
            userId,
            code: seed.code,
            name: seed.name,
            type: seed.type,
          }),
        ),
      );
    }
    return { created, skipped };
  }

  async createAccount(
    userId: string,
    code: string,
    name: string,
    type: AccountType,
  ): Promise<LedgerAccount> {
    const existing = await this.accountRepository.findOne({ where: { userId, code } });
    if (existing) {
      throw new ConflictException('account code ' + code + ' already exists');
    }
    return this.accountRepository.save(
      this.accountRepository.create({ userId, code, name, type }),
    );
  }

  async findAccounts(userId: string): Promise<LedgerAccount[]> {
    return this.accountRepository.find({ where: { userId }, order: { code: 'ASC' } });
  }

  async trialBalanceFor(userId: string) {
    const accounts = await this.findAccounts(userId);
    const journals = await this.journalRepository.find({ where: { userId } });
    const lines = journals.flatMap((journal) =>
      journal.lines.map((line) => ({
        accountId: line.accountId,
        side: line.side,
        amountCents: line.amountCents,
      })),
    );
    const result = trialBalance(
      accounts.map((a) => ({ id: a.id, code: a.code, type: a.type })),
      lines,
    );
    return { ...result, journalCount: journals.length };
  }

  // ---------------- manual journals ----------------

  async postJournal(userId: string, dto: CreateJournalDto): Promise<JournalEntry> {
    const duplicate = await this.journalRepository.findOne({
      where: { userId, idempotencyKey: dto.idempotencyKey },
    });
    if (duplicate) {
      throw new ConflictException(
        'idempotency key already posted as journal ' + duplicate.id,
      );
    }
    const accounts = await this.findAccounts(userId);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const verdict = validateJournal(dto.lines);
    if (!verdict.ok) {
      throw new BadRequestException('journal refused: ' + verdict.reasons.join('; '));
    }
    for (const line of dto.lines) {
      if (!byId.has(line.accountId)) {
        throw new BadRequestException('account ' + line.accountId + ' is not in your chart');
      }
    }
    const snapshot: JournalLine[] = dto.lines.map((line) => {
      const account = byId.get(line.accountId)!;
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        side: line.side,
        amountCents: line.amountCents,
      };
    });
    const journal = this.journalRepository.create({
      userId,
      description: dto.description,
      sourceType: 'manual',
      sourceId: dto.sourceId,
      idempotencyKey: dto.idempotencyKey,
      lines: snapshot,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      totalCents: verdict.debitCents,
    });
    return this.journalRepository.save(journal);
  }

  async findJournals(userId: string): Promise<JournalEntry[]> {
    return this.journalRepository.find({ where: { userId }, order: { occurredAt: 'DESC' } });
  }

  // ---------------- automatic postings from the money-in wedge ----------------

  private async requirePostingAccounts(userId: string) {
    const accounts = await this.findAccounts(userId);
    const byCode = new Map(accounts.map((a) => [a.code, a]));
    const need = (code: string) => {
      const account = byCode.get(code);
      if (!account) {
        throw new ConflictException(
          'chart is missing account ' + code + ' — seed the standard chart first',
        );
      }
      return account.id;
    };
    return {
      accountsReceivableId: need('1100'),
      revenueId: need('4000'),
      taxPayableId: need('2100'),
      cashId: need('1010'),
      returnsId: need('4900'),
    };
  }

  async postInvoiceIssuedFor(userId: string, invoiceId: string): Promise<JournalEntry> {
    const invoice = await this.invoiceRepository.findOne({ where: { id: invoiceId, userId } });
    if (!invoice) throw new NotFoundException('invoice ' + invoiceId + ' not found');
    if (invoice.status !== InvoiceStatus.SENT && invoice.status !== InvoiceStatus.OVERDUE) {
      throw new ConflictException(
        'only sent invoices post to the ledger; this invoice is ' + invoice.status,
      );
    }
    const ids = await this.requirePostingAccounts(userId);
    const lines = postInvoiceIssued(
      {
        subtotalCents: invoice.subtotalCents,
        taxCents: invoice.taxCents,
        totalCents: invoice.totalCents,
      },
      ids,
    );
    return this.postAuto(userId, 'invoice_issued', invoice.id, invoice.number, lines, {
      idempotencyKey: 'invoice-issued-' + invoice.id,
      description: 'Invoice ' + invoice.number + ' issued to ' + (invoice.customerName ?? 'customer'),
    });
  }

  async postInvoicePaymentFor(userId: string, invoiceId: string): Promise<JournalEntry> {
    const invoice = await this.invoiceRepository.findOne({ where: { id: invoiceId, userId } });
    if (!invoice) throw new NotFoundException('invoice ' + invoiceId + ' not found');
    if (invoice.status !== InvoiceStatus.PAID) {
      throw new ConflictException('only paid invoices post a payment; this invoice is ' + invoice.status);
    }
    const ids = await this.requirePostingAccounts(userId);
    const lines = postPaymentReceived(invoice.totalCents, ids);
    return this.postAuto(userId, 'invoice_payment', invoice.id, invoice.number, lines, {
      idempotencyKey: 'invoice-payment-' + invoice.id,
      description: 'Payment received for invoice ' + invoice.number,
    });
  }

  async postCreditNoteIssuedFor(userId: string, noteId: string): Promise<JournalEntry> {
    const note = await this.noteRepository.findOne({ where: { id: noteId, userId } });
    if (!note) throw new NotFoundException('credit note ' + noteId + ' not found');
    if (note.appliedCents <= 0) {
      throw new ConflictException('only an applied credit note posts to the ledger');
    }
    const ids = await this.requirePostingAccounts(userId);
    const lines = postCreditNoteIssued(note.appliedCents, ids);
    return this.postAuto(userId, 'credit_note_issued', note.id, note.id.slice(0, 8), lines, {
      idempotencyKey: 'credit-note-' + note.id,
      description: 'Credit note applied against receivables',
    });
  }

  private async postAuto(
    userId: string,
    sourceType: 'invoice_issued' | 'invoice_payment' | 'credit_note_issued',
    sourceId: string,
    label: string,
    lines: { accountId: string; side: 'debit' | 'credit'; amountCents: number }[],
    meta: { idempotencyKey: string; description: string },
  ): Promise<JournalEntry> {
    const verdict = validateJournal(lines);
    if (!verdict.ok) {
      throw new BadRequestException('journal refused: ' + verdict.reasons.join('; '));
    }
    const duplicate = await this.journalRepository.findOne({
      where: { userId, idempotencyKey: meta.idempotencyKey },
    });
    if (duplicate) {
      throw new ConflictException(
        'this event already posted as journal ' + duplicate.id + ' (' + label + ')',
      );
    }
    const accounts = await this.findAccounts(userId);
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const snapshot: JournalLine[] = lines.map((line) => {
      const account = byId.get(line.accountId);
      if (!account) {
        throw new ConflictException('chart is missing a posting account — seed the chart first');
      }
      return {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        side: line.side,
        amountCents: line.amountCents,
      };
    });
    const journal = this.journalRepository.create({
      userId,
      description: meta.description,
      sourceType,
      sourceId,
      idempotencyKey: meta.idempotencyKey,
      lines: snapshot,
      occurredAt: new Date(),
      totalCents: verdict.debitCents,
    });
    return this.journalRepository.save(journal);
  }
}
