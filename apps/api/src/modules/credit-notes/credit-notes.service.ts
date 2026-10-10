// ============================================================================
// FILE: /apps/api/src/modules/credit-notes/credit-notes.service.ts
// ============================================================================
// Zero-trust credit notes. Every read and write is scoped to the
// authenticated user. Applying a note runs the pure allocation engine over
// the user's eligible invoices (oldest due first), appends to the ledger,
// and marks an invoice paid only when its total is fully covered.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditNote, CreditApplication } from './entities/credit-note.entity';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceStatus } from '../invoices/enums';
import { effectiveStatus } from '../invoices/engine/invoice-math';
import { allocateCredit, remainingCredit } from './engine/credit-allocation';

@Injectable()
export class CreditNotesService {
  constructor(
    @InjectRepository(CreditNote)
    private readonly noteRepository: Repository<CreditNote>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
  ) {}

  async create(userId: string, dto: CreateCreditNoteDto): Promise<CreditNote> {
    if (!Number.isInteger(dto.amountCents) || dto.amountCents <= 0) {
      throw new BadRequestException('credit note amount must be a positive integer number of cents');
    }
    const note = this.noteRepository.create({
      userId,
      currency: dto.currency ?? 'USD',
      amountCents: dto.amountCents,
      appliedCents: 0,
      status: 'open',
      reason: dto.reason,
      applications: [],
    });
    return this.noteRepository.save(note);
  }

  async findAll(userId: string): Promise<CreditNote[]> {
    return this.noteRepository.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async findOne(userId: string, id: string): Promise<CreditNote> {
    const note = await this.noteRepository.findOne({ where: { id, userId } });
    if (!note) {
      throw new NotFoundException('credit note with id ' + id + ' not found');
    }
    return note;
  }

  /**
   * Applies the note's remaining credit to the user's eligible invoices,
   * oldest due date first. Optionally restricted to explicit invoice ids.
   */
  async apply(
    userId: string,
    id: string,
    invoiceIds?: string[],
  ): Promise<{
    note: CreditNote;
    allocations: { invoiceId: string; appliedCents: number }[];
    skipped: { id: string; reason: string }[];
  }> {
    const note = await this.findOne(userId, id);
    if (note.status === 'void') {
      throw new ConflictException('a voided credit note cannot be applied');
    }
    if (note.status === 'applied') {
      throw new ConflictException('this credit note is already fully applied');
    }
    const remaining = remainingCredit(note.amountCents, note.appliedCents);
    if (remaining <= 0) {
      throw new ConflictException('this credit note has no remaining credit');
    }

    const invoices = await this.invoiceRepository.find({ where: { userId } });
    const now = new Date();
    const projected = invoices.map((invoice) => ({
      raw: invoice,
      status: effectiveStatus(invoice.status, now, invoice.dueDate, invoice.paidAt),
    }));

    let pool = projected;
    if (invoiceIds !== undefined && invoiceIds.length > 0) {
      const wanted = new Set(invoiceIds);
      for (const wantedId of invoiceIds) {
        if (!projected.some((p) => p.raw.id === wantedId)) {
          throw new NotFoundException('invoice with id ' + wantedId + ' not found for this user');
        }
      }
      pool = projected.filter((p) => wanted.has(p.raw.id));
    }

    const result = allocateCredit(
      remaining,
      pool.map((p) => ({
        id: p.raw.id,
        status: p.status,
        totalCents: p.raw.totalCents,
        dueDate: p.raw.dueDate,
      })),
    );

    if (result.allocations.length === 0) {
      throw new ConflictException(
        'no eligible invoice could absorb this credit: ' +
          (result.skipped.length > 0 ? result.skipped.map((s) => s.reason).join('; ') : 'nothing outstanding'),
      );
    }

    const appliedAt = new Date().toISOString();
    for (const allocation of result.allocations) {
      const target = projected.find((p) => p.raw.id === allocation.invoiceId)!.raw;
      if (allocation.appliedCents >= target.totalCents) {
        target.status = InvoiceStatus.PAID;
        target.paidAt = new Date();
        await this.invoiceRepository.save(target);
      }
      const entry: CreditApplication = {
        invoiceId: target.id,
        invoiceNumber: target.number,
        appliedCents: allocation.appliedCents,
        appliedAt,
      };
      note.applications = [...(note.applications ?? []), entry];
    }
    note.appliedCents = note.appliedCents + result.appliedCents;
    note.status = remainingCredit(note.amountCents, note.appliedCents) === 0 ? 'applied' : 'open';
    await this.noteRepository.save(note);
    return { note, allocations: result.allocations, skipped: result.skipped };
  }

  async voidNote(userId: string, id: string): Promise<CreditNote> {
    const note = await this.findOne(userId, id);
    if (note.status === 'void') {
      throw new ConflictException('credit note is already void');
    }
    if (note.appliedCents > 0) {
      throw new ConflictException(
        'credit already applied (' + note.appliedCents + ' cents) cannot be voided; issue a corrective note instead',
      );
    }
    note.status = 'void';
    return this.noteRepository.save(note);
  }

  async remove(userId: string, id: string): Promise<void> {
    const note = await this.findOne(userId, id);
    if (note.status === 'applied') {
      throw new ConflictException('an applied credit note is part of the ledger and cannot be deleted');
    }
    await this.noteRepository.softDelete({ id: note.id, userId });
  }
}
