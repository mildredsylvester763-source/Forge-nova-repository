// ============================================================================
// FILE: /apps/api/src/modules/invoices/invoices.service.ts
// ============================================================================
// Zero-trust invoice bookkeeping. Every read and write is scoped to the
// authenticated user; the only "now" is read here in the service, never in
// the engine; status changes must pass the engine's state machine or the
// refusal reason is quoted back to the caller.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from './entities/invoice.entity';
import { InvoiceStatus } from './enums';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import {
  DEFAULT_NET_DAYS,
  canTransition,
  computeTotals,
  dueDateFor,
  effectiveStatus,
} from './engine/invoice-math';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
  ) {}

  async create(userId: string, dto: CreateInvoiceDto): Promise<Invoice> {
    if (!Array.isArray(dto.lineItems) || dto.lineItems.length === 0) {
      throw new BadRequestException('an invoice needs at least one line item');
    }
    const taxRateBp = dto.taxRatePercent === undefined ? 0 : Math.round(dto.taxRatePercent * 100);
    const totals = computeTotals(dto.lineItems, taxRateBp);
    if (totals.lineItems.length === 0) {
      throw new BadRequestException(
        'every line item was invalid: ' + totals.invalidLines.map((l) => l.reason).join('; '),
      );
    }
    const issueDate = dto.issueDate ? new Date(dto.issueDate) : new Date();
    const invoice = this.invoiceRepository.create({
      userId,
      accountId: userId,
      number: await this.nextNumber(userId),
      currency: dto.currency ?? 'USD',
      status: InvoiceStatus.DRAFT,
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      productId: dto.productId,
      lineItems: totals.lineItems,
      subtotalCents: totals.subtotalCents,
      taxRateBp: totals.taxRateBp,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      issueDate,
      dueDate: dueDateFor(issueDate, dto.netDays ?? DEFAULT_NET_DAYS),
      notes: dto.notes,
    });
    return this.invoiceRepository.save(invoice);
  }

  async findAll(userId: string, status?: InvoiceStatus): Promise<Invoice[]> {
    const where: { userId: string; status?: InvoiceStatus } = { userId };
    if (status) where.status = status;
    const invoices = await this.invoiceRepository.find({ where, order: { createdAt: 'DESC' } });
    return this.projectOverdue(invoices);
  }

  async findOne(userId: string, id: string): Promise<Invoice> {
    const invoice = await this.getOwned(userId, id);
    return this.projectOverdue([invoice])[0];
  }

  async markSent(userId: string, id: string): Promise<Invoice> {
    const invoice = await this.getOwned(userId, id);
    const verdict = canTransition(invoice.status, InvoiceStatus.SENT);
    if (!verdict.allowed) {
      throw new ConflictException(verdict.reason);
    }
    invoice.status = InvoiceStatus.SENT;
    invoice.sentAt = new Date();
    return this.invoiceRepository.save(invoice);
  }

  async markPaid(userId: string, id: string): Promise<Invoice> {
    const invoice = await this.getOwned(userId, id);
    const verdict = canTransition(
      this.projectedStatus(invoice),
      InvoiceStatus.PAID,
    );
    if (!verdict.allowed) {
      throw new ConflictException(verdict.reason);
    }
    invoice.status = InvoiceStatus.PAID;
    invoice.paidAt = new Date();
    return this.invoiceRepository.save(invoice);
  }

  async voidInvoice(userId: string, id: string): Promise<Invoice> {
    const invoice = await this.getOwned(userId, id);
    const verdict = canTransition(
      this.projectedStatus(invoice),
      InvoiceStatus.VOID,
    );
    if (!verdict.allowed) {
      throw new ConflictException(verdict.reason);
    }
    invoice.status = InvoiceStatus.VOID;
    return this.invoiceRepository.save(invoice);
  }

  async remove(userId: string, id: string): Promise<void> {
    const invoice = await this.getOwned(userId, id);
    await this.invoiceRepository.softDelete({ id: invoice.id, userId });
  }

  private async nextNumber(userId: string): Promise<string> {
    const [latest] = await this.invoiceRepository.find({
      where: { userId },
      order: { number: 'DESC' },
      take: 1,
      withDeleted: true,
    });
    const seq = latest ? parseInt(latest.number.replace(/[^0-9]/g, ''), 10) + 1 : 1;
    return 'INV-' + String(seq).padStart(4, '0');
  }

  private async getOwned(userId: string, id: string): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findOne({ where: { id, userId } });
    if (!invoice) {
      throw new NotFoundException('Invoice with id ' + id + ' not found');
    }
    return invoice;
  }

  private projectedStatus(invoice: Invoice): InvoiceStatus {
    return effectiveStatus(invoice.status, new Date(), invoice.dueDate, invoice.paidAt);
  }

  private projectOverdue(invoices: Invoice[]): Invoice[] {
    const now = new Date();
    return invoices.map((invoice) => {
      const status = effectiveStatus(invoice.status, now, invoice.dueDate, invoice.paidAt);
      return status === invoice.status ? invoice : { ...invoice, status };
    });
  }
}
