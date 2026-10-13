// ============================================================================
// FILE: /apps/api/src/modules/customer-statements/customer-statements.service.ts
// ============================================================================
// Composes receivables statements from invoice rows. Optional 'customer'
// filter narrows to one customer; otherwise every customer with open
// invoices gets a statement, keyed by customerName.

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceStatus } from '../invoices/enums';
import { composeStatement } from './engine/statement';

@Injectable()
export class CustomerStatementsService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
  ) {}

  async composeFor(userId: string, customerName?: string): Promise<unknown> {
    const open = await this.invoiceRepository.find({
      where: { userId, status: In([InvoiceStatus.SENT, InvoiceStatus.OVERDUE]) },
    });
    const customers = new Map<string, Invoice[]>();
    for (const invoice of open) {
      const name = invoice.customerName ?? '(unnamed customer)';
      const list = customers.get(name) || [];
      list.push(invoice);
      customers.set(name, list);
    }
    const rows = [...customers.entries()];
    const filtered = customerName
      ? rows.filter(([name]) => name === customerName)
      : rows;
    if (filtered.length === 0) {
      throw new BadRequestException('no outstanding invoices to report');
    }
    const now = new Date();
    return filtered.map(([name, invoices]) => {
      const verdict = composeStatement(
        invoices.map((i) => ({
          id: i.id,
          number: i.number,
          totalCents: i.totalCents,
          status: i.status,
          dueAt: i.dueAt ?? null,
        })),
        now,
      );
      if (!verdict.ok) {
        throw new BadRequestException(verdict.reason);
      }
      return {
        customerName: name,
        invoiceCount: invoices.length,
        buckets: verdict.value.buckets,
        outstandingCents: verdict.value.outstandingCents,
      };
    });
  }
}
