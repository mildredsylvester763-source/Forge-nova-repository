// ============================================================================
// FILE: /apps/api/src/modules/agent/agent.service.ts
// ============================================================================
// The "you talk, it runs the business" wedge. The engines decide everything;
// this service loads data, calls them, persists the command audit row, and
// turns refusals into structured answers — never silent guesses.

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AgentCommand } from './entities/agent-command.entity';
import { AgentCommandDto } from './dto/agent-command.dto';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceStatus } from '../invoices/enums';
import { Payment } from '../payments/entities/payment.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { classifyIntent, normalizeCommand } from './engine/agent-command';
import { parseSearchQuery } from './engine/nl-search';
import { draftInvoiceFromText } from './engine/invoice-draft';
import { cashflowForecast, weeklyReport } from './engine/business-report';

@Injectable()
export class AgentService {
  constructor(
    @InjectRepository(AgentCommand)
    private readonly commandRepository: Repository<AgentCommand>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
  ) {}

  async command(userId: string, dto: AgentCommandDto) {
    const normalized = normalizeCommand(dto.text);
    if (!normalized.ok) {
      return this.persist(userId, dto.text, null, normalized.reason, { ok: false, reason: normalized.reason });
    }
    const classified = classifyIntent(normalized.value.text);
    if (!classified.ok) {
      return this.persist(userId, dto.text, normalized.value.text, classified.reason, { ok: false, reason: classified.reason });
    }
    const response: Record<string, unknown> = {
      ok: true,
      intent: classified.value.intent,
      confidence: classified.value.confidence,
    };
    if (classified.value.intent === 'invoice.create') {
      response.draft = draftInvoiceFromText(dto.text);
    }
    return this.persist(userId, dto.text, normalized.value.text, null, response);
  }

  private async persist(
    userId: string,
    rawText: string,
    normalizedText: string | null,
    refusalReason: string | null,
    response: Record<string, unknown>,
  ) {
    return this.commandRepository.save(
      this.commandRepository.create({
        userId,
        rawText,
        ...(normalizedText ? { normalizedText } : {}),
        ...(refusalReason
          ? { refusalReason }
          : response.intent !== undefined
            ? { intent: String(response.intent) }
            : {}),
        response,
      }),
    );
  }

  async search(userId: string, q: string) {
    const verdict = parseSearchQuery(q, new Date());
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const filter = verdict.value;
    const from = filter.from ? new Date(filter.from) : null;
    const to = filter.to ? new Date(filter.to) : null;
    if (filter.entity === 'invoices' || filter.entity === 'all') {
      const rows = await this.invoiceRepository.find({ where: { userId } });
      return {
        filter,
        results: rows.filter(
          (i) =>
            (!filter.customer || (i.customerName ?? '').toLowerCase().includes(filter.customer)) &&
            (!from || (i.issueDate ?? new Date(0)) >= from) &&
            (!to || (i.issueDate ?? new Date(0)) <= to) &&
            (filter.minCents === undefined || i.totalCents >= filter.minCents) &&
            (filter.maxCents === undefined || i.totalCents <= filter.maxCents),
        ).map((i) => ({ entity: 'invoice', number: i.number, customerName: i.customerName, totalCents: i.totalCents, status: i.status })),
      };
    }
    if (filter.entity === 'payments') {
      const rows = await this.paymentRepository.find({ where: { userId } });
      return {
        filter,
        results: rows.filter(
          (p) =>
            (!filter.customer || (p.customerName ?? '').toLowerCase().includes(filter.customer)) &&
            (!from || p.receivedAt >= from) &&
            (!to || p.receivedAt <= to) &&
            (filter.minCents === undefined || p.amountCents >= filter.minCents) &&
            (filter.maxCents === undefined || p.amountCents <= filter.maxCents),
        ).map((p) => ({ entity: 'payment', amountCents: p.amountCents, customerName: p.customerName, receivedAt: p.receivedAt })),
      };
    }
    if (filter.entity === 'expenses') {
      const rows = await this.expenseRepository.find({ where: { userId } });
      return {
        filter,
        results: rows.filter(
          (e) =>
            (!filter.customer || (e.vendorName ?? '').toLowerCase().includes(filter.customer)) &&
            (!from || e.incurredAt >= from) &&
            (!to || e.incurredAt <= to) &&
            (filter.minCents === undefined || e.amountCents >= filter.minCents) &&
            (filter.maxCents === undefined || e.amountCents <= filter.maxCents),
        ).map((e) => ({ entity: 'expense', description: e.description, category: e.category, amountCents: e.amountCents, incurredAt: e.incurredAt })),
      };
    }
    // contacts: identity search by name fragment.
    return { filter, results: [], note: 'contacts search is served by the contacts module' };
  }

  async weeklyReportFor(userId: string) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const [invoices, payments, expenses, overdue] = await Promise.all([
      this.invoiceRepository.find({ where: { userId } }),
      this.paymentRepository.find({ where: { userId } }),
      this.expenseRepository.find({ where: { userId } }),
      this.invoiceRepository.count({ where: { userId, status: InvoiceStatus.OVERDUE } }),
    ]);
    const invoicedCents = invoices
      .filter((i) => (i.issueDate ?? new Date(0)) >= weekAgo)
      .reduce((s, i) => s + i.totalCents, 0);
    const collectedCents = payments
      .filter((p) => p.receivedAt >= weekAgo)
      .reduce((s, p) => s + p.amountCents, 0);
    const expensesCents = expenses
      .filter((e) => e.incurredAt >= weekAgo)
      .reduce((s, e) => s + e.amountCents, 0);
    const verdict = weeklyReport({ invoicedCents, collectedCents, expensesCents, overdueCount: overdue }, now);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return verdict.value;
  }

  async cashflowForecastFor(userId: string, horizonDays: number) {
    const now = new Date();
    const open = await this.invoiceRepository.find({
      where: { userId, status: In([InvoiceStatus.SENT, InvoiceStatus.OVERDUE]) },
    });
    const ninetyAgo = new Date(now.getTime() - 90 * 86400000);
    const expenses = await this.expenseRepository.find({ where: { userId } });
    const quarterlySpend = expenses
      .filter((e) => e.incurredAt >= ninetyAgo)
      .reduce((s, e) => s + e.amountCents, 0);
    // Average monthly burn derived from the last 90 days of expenses.
    const recurring = quarterlySpend > 0 ? [{ amountCents: Math.round(quarterlySpend / 3), dayOfMonth: 1 }] : [];
    const verdict = cashflowForecast(
      open.map((i) => ({ totalCents: i.totalCents, dueDate: i.dueDate ? i.dueDate.toISOString() : null })),
      recurring,
      now,
      horizonDays,
    );
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return verdict.value;
  }

  async commandHistory(userId: string): Promise<AgentCommand[]> {
    return this.commandRepository.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 50 });
  }
}
