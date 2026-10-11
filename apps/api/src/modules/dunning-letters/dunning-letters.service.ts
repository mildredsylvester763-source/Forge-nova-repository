// ============================================================================
// FILE: /apps/api/src/modules/dunning-letters/dunning-letters.service.ts
// ============================================================================
// Composes and stores dunning letters from the existing pure dunning engine
// (invoice-dunning.ts). The letter itself is composed by the pure letter
// engine; this service only loads the invoice, runs the dunning math, checks
// stage eligibility and persists. Zero-trust userId scoping everywhere.

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../invoices/entities/invoice.entity';
import { computeDunning, DEFAULT_DUNNING_TERMS } from '../invoices/engine/invoice-dunning';
import { composeLetter, isLetterRefusal, LetterBranding } from './engine/dunning-letter';
import { DunningLetter } from './entities/dunning-letter.entity';

@Injectable()
export class DunningLettersService {
  constructor(
    @InjectRepository(DunningLetter)
    private readonly letters: Repository<DunningLetter>,
    @InjectRepository(Invoice)
    private readonly invoices: Repository<Invoice>,
  ) {}

  /** Compose (and persist) the letter for one invoice + ladder stage. */
  async composeFor(userId: string, invoiceId: string, offsetDays: number, branding?: LetterBranding) {
    const invoice = await this.invoices.findOneBy({ id: invoiceId, userId });
    if (!invoice) throw new NotFoundException('invoice not found');

    const now = new Date();
    const dunning = computeDunning(
      {
        status: invoice.status,
        totalCents: invoice.totalCents,
        dueDate: invoice.dueDate ?? null,
        paidAt: invoice.paidAt ?? null,
      },
      DEFAULT_DUNNING_TERMS,
      now,
    );

    const composed = composeLetter(
      {
        status: invoice.status,
        number: invoice.number,
        currency: invoice.currency,
        totalCents: invoice.totalCents,
        customerName: invoice.customerName ?? null,
        dueDate: invoice.dueDate ?? null,
        paidAt: invoice.paidAt ?? null,
        daysOverdue: dunning.daysOverdue,
        lateFeeCents: dunning.lateFeeCents,
        feeReason: dunning.feeReason,
      },
      offsetDays,
      branding ?? {},
      now,
    );
    if (isLetterRefusal(composed)) {
      throw new BadRequestException(composed.reason);
    }

    // Idempotency: one letter per invoice per stage. Return the existing one.
    const existing = await this.letters.findOneBy({ userId, invoiceId, stageOffsetDays: offsetDays });
    if (existing) return { letter: existing, reused: true };

    const letter = this.letters.create({
      userId,
      invoiceId,
      stageOffsetDays: offsetDays,
      tone: composed.tone,
      subject: composed.subject,
      body: composed.body,
      daysOverdue: dunning.daysOverdue,
      lateFeeCents: dunning.lateFeeCents,
    });
    const saved = await this.letters.save(letter);
    return { letter: saved, reused: false };
  }

  /** Mark a stored letter as sent (delivery itself rides the egress rail). */
  async markSent(userId: string, letterId: string) {
    const letter = await this.letters.findOneBy({ id: letterId, userId });
    if (!letter) throw new NotFoundException('letter not found');
    if (letter.sentAt) return letter;
    letter.sentAt = new Date();
    return this.letters.save(letter);
  }

  /** All letters for one invoice, stage order ascending. */
  async listForInvoice(userId: string, invoiceId: string) {
    const invoice = await this.invoices.findOneBy({ id: invoiceId, userId });
    if (!invoice) throw new NotFoundException('invoice not found');
    return this.letters.find({
      where: { userId, invoiceId },
      order: { stageOffsetDays: 'ASC' },
    });
  }

  /** Every letter the user owns, newest first. */
  async listAll(userId: string) {
    return this.letters.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async remove(userId: string, letterId: string) {
    const letter = await this.letters.findOneBy({ id: letterId, userId });
    if (!letter) throw new NotFoundException('letter not found');
    if (letter.sentAt) {
      throw new ForbiddenException('a sent letter is an audit record and cannot be deleted');
    }
    await this.letters.remove(letter);
    return { deleted: true };
  }
}
