// ============================================================================
// FILE: /apps/api/src/modules/receipts/receipts.service.ts
// ============================================================================
// Issuing is idempotent: asking again for the same payment returns the
// existing receipt with reused: true rather than minting a duplicate.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Receipt } from './entities/receipt.entity';
import { Payment } from '../payments/entities/payment.entity';
import { formatReceiptNumber, validateReceiptInput } from './engine/receipt-format';

@Injectable()
export class ReceiptsService {
  constructor(
    @InjectRepository(Receipt)
    private readonly receiptRepository: Repository<Receipt>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
  ) {}

  async issueForPayment(
    userId: string,
    paymentId: string,
  ): Promise<Receipt & { reused: boolean }> {
    const payment = await this.paymentRepository.findOne({ where: { id: paymentId, userId } });
    if (!payment) {
      throw new NotFoundException('payment ' + paymentId + ' not found');
    }
    const verdict = validateReceiptInput({
      amountCents: payment.amountCents,
      receivedAt: payment.receivedAt,
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const existing = await this.receiptRepository.findOne({ where: { paymentId, userId } });
    if (existing) {
      return Object.assign(existing, { reused: true });
    }
    const seq = await this.nextSequence(userId);
    const numberVerdict = formatReceiptNumber(seq);
    if (!numberVerdict.ok) {
      throw new BadRequestException(numberVerdict.reason);
    }
    const receipt = await this.receiptRepository.save(
      this.receiptRepository.create({
        userId,
        paymentId,
        receiptNumber: numberVerdict.value,
        amountCents: payment.amountCents,
        currency: payment.currency,
        customerName: payment.customerName,
        allocations: payment.allocations,
        issuedAt: new Date(),
      }),
    );
    return Object.assign(receipt, { reused: false });
  }

  async findAll(userId: string): Promise<Receipt[]> {
    return this.receiptRepository.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async findOne(userId: string, id: string): Promise<Receipt> {
    const receipt = await this.receiptRepository.findOne({ where: { id, userId } });
    if (!receipt) {
      throw new NotFoundException('receipt ' + id + ' not found');
    }
    return receipt;
  }

  private async nextSequence(userId: string): Promise<number> {
    const last = await this.receiptRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (!last) return 1;
    const digits = last.receiptNumber.replace(/[^0-9]/g, '');
    const seq = Number.parseInt(digits, 10);
    return Number.isFinite(seq) ? seq + 1 : 1;
  }
}
