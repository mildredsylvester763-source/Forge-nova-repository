// ============================================================================
// FILE: /apps/api/src/modules/payments/payments.service.ts
// ============================================================================
// Money in, honestly allocated. The engine decides the split; this service
// only loads invoices, persists the payment, and marks fully-covered
// invoices PAID through the invoices service — never by editing rows.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceStatus } from '../invoices/enums';
import { InvoicesService } from '../invoices/invoices.service';
import { AccountingService } from '../accounting/accounting.service';
import { allocatePayment } from './engine/payment-allocation';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    private readonly invoicesService: InvoicesService,
    private readonly accountingService: AccountingService,
  ) {}

  async record(userId: string, dto: RecordPaymentDto): Promise<Payment> {
    const open = await this.invoiceRepository.find({
      where: { userId, status: In([InvoiceStatus.SENT, InvoiceStatus.OVERDUE]) },
      order: { number: 'ASC' },
    });
    const candidates = dto.customerName
      ? open.filter((i) => (i.customerName ?? '') === dto.customerName)
      : open;
    const verdict = allocatePayment(
      candidates.map((i) => ({
        id: i.id,
        number: i.number,
        totalCents: i.totalCents,
        dueAt: i.dueAt ?? null,
        status: i.status,
      })),
      dto.amountCents,
    );
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    const payment = await this.paymentRepository.save(
      this.paymentRepository.create({
        userId,
        amountCents: dto.amountCents,
        currency: open[0]?.currency ?? 'USD',
        method: dto.method ?? 'manual',
        reference: dto.reference,
        customerName: dto.customerName,
        allocations: verdict.value.allocations,
        receivedAt,
      }),
    );
    // Mark fully-covered invoices PAID through the owning service.
    for (const allocation of verdict.value.allocations) {
      if (allocation.fullyPaid) {
        await this.invoicesService.markPaid(userId, allocation.invoiceId);
      }
    }
    // Post each fully-paid invoice to the ledger. If the chart is not seeded
    // the payment still stands, but the omission is surfaced, never silent.
    const ledgerWarnings: string[] = [];
    for (const allocation of verdict.value.allocations) {
      if (allocation.fullyPaid) {
        try {
          await this.accountingService.postInvoicePaymentFor(userId, allocation.invoiceId);
        } catch (err) {
          ledgerWarnings.push(
            'invoice ' + allocation.invoiceNumber + ' not posted to the ledger: ' + (err as Error).message,
          );
        }
      }
    }
    (payment as Payment & { ledgerWarnings?: string[] }).ledgerWarnings = ledgerWarnings;
    return payment;
  }

  async findAll(userId: string): Promise<Payment[]> {
    return this.paymentRepository.find({ where: { userId }, order: { receivedAt: 'DESC' } });
  }

  async findOne(userId: string, id: string): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({ where: { id, userId } });
    if (!payment) {
      throw new NotFoundException('payment ' + id + ' not found');
    }
    return payment;
  }
}
