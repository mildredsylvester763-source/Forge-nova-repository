// ============================================================================
// FILE: /apps/api/src/modules/recurring/recurring.service.ts
// ============================================================================
// Zero-trust recurring profiles. Every read and write is scoped to the
// authenticated user. Running a profile creates a real invoice through the
// invoices service — exactly one invoice per run, never a silent catch-up
// flood; if the profile is still due afterwards it says so.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecurringInvoiceProfile } from './entities/recurring-invoice-profile.entity';
import { CreateRecurringProfileDto } from './dto/create-recurring-profile.dto';
import { InvoicesService } from '../invoices/invoices.service';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import {
  advance,
  firstOccurrence,
  validateAnchor,
} from './engine/recurring-schedule';

@Injectable()
export class RecurringService {
  constructor(
    @InjectRepository(RecurringInvoiceProfile)
    private readonly profileRepository: Repository<RecurringInvoiceProfile>,
    private readonly invoicesService: InvoicesService,
  ) {}

  async create(userId: string, dto: CreateRecurringProfileDto): Promise<RecurringInvoiceProfile> {
    const verdict = validateAnchor(dto.frequency, dto.anchorDay);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    if (!Array.isArray(dto.template?.lineItems) || dto.template.lineItems.length === 0) {
      throw new BadRequestException('a recurring profile needs at least one template line item');
    }
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const first = firstOccurrence(startDate, dto.frequency, dto.anchorDay);
    const profile = this.profileRepository.create({
      userId,
      frequency: dto.frequency,
      anchorDay: dto.anchorDay,
      startDate,
      nextRunAt: first.next,
      active: true,
      template: dto.template,
    });
    return this.profileRepository.save(profile);
  }

  async findAll(userId: string, activeOnly?: boolean): Promise<RecurringInvoiceProfile[]> {
    const where: { userId: string; active?: boolean } = { userId };
    if (activeOnly !== undefined) where.active = activeOnly;
    return this.profileRepository.find({ where, order: { nextRunAt: 'ASC' } });
  }

  async findDue(userId: string): Promise<RecurringInvoiceProfile[]> {
    const now = new Date();
    const profiles = await this.profileRepository.find({
      where: { userId, active: true },
      order: { nextRunAt: 'ASC' },
    });
    return profiles.filter((p) => p.nextRunAt.getTime() <= now.getTime());
  }

  async findOne(userId: string, id: string): Promise<RecurringInvoiceProfile> {
    const profile = await this.profileRepository.findOne({ where: { id, userId } });
    if (!profile) {
      throw new NotFoundException('recurring profile with id ' + id + ' not found');
    }
    return profile;
  }

  async pause(userId: string, id: string): Promise<RecurringInvoiceProfile> {
    const profile = await this.findOne(userId, id);
    if (!profile.active) {
      throw new ConflictException('profile is already paused');
    }
    profile.active = false;
    return this.profileRepository.save(profile);
  }

  async resume(userId: string, id: string): Promise<RecurringInvoiceProfile> {
    const profile = await this.findOne(userId, id);
    if (profile.active) {
      throw new ConflictException('profile is already active');
    }
    profile.active = true;
    return this.profileRepository.save(profile);
  }

  /** Runs ONE due occurrence. Honest refusal, never a catch-up flood. */
  async run(userId: string, id: string): Promise<{ profile: RecurringInvoiceProfile; invoice?: any; stillDue: boolean; reason: string }> {
    const profile = await this.findOne(userId, id);
    const now = new Date();
    const verdict = advance(profile, now);
    if (!verdict.due) {
      throw new ConflictException('profile is not due yet: ' + verdict.reason);
    }
    if (!Array.isArray(profile.template?.lineItems) || profile.template.lineItems.length === 0) {
      throw new ConflictException('profile template has no line items; fix the template before running');
    }
    const invoice = await this.invoicesService.create(userId, profile.template as unknown as CreateInvoiceDto);
    profile.lastRunAt = verdict.runAt;
    profile.nextRunAt = verdict.nextRunAt;
    await this.profileRepository.save(profile);
    const stillDue = profile.active && profile.nextRunAt.getTime() <= now.getTime();
    return {
      profile,
      invoice,
      stillDue,
      reason: stillDue
        ? 'one occurrence generated; the profile is still behind schedule'
        : 'invoice generated, schedule is current',
    };
  }

  /** Runs every due profile once. Each profile generates at most one invoice. */
  async runDue(userId: string): Promise<{ created: any[]; skipped: { id: string; reason: string }[]; stillDue: { id: string; nextRunAt: Date }[] }> {
    const now = new Date();
    const profiles = await this.findDue(userId);
    const created: any[] = [];
    const skipped: { id: string; reason: string }[] = [];
    const stillDue: { id: string; nextRunAt: Date }[] = [];
    for (const profile of profiles) {
      if (!Array.isArray(profile.template?.lineItems) || profile.template.lineItems.length === 0) {
        skipped.push({ id: profile.id, reason: 'template has no line items' });
        continue;
      }
      const invoice = await this.invoicesService.create(userId, profile.template as unknown as CreateInvoiceDto);
      const verdict = advance(profile, now);
      profile.lastRunAt = verdict.runAt;
      profile.nextRunAt = verdict.nextRunAt;
      await this.profileRepository.save(profile);
      created.push(invoice);
      if (profile.nextRunAt.getTime() <= now.getTime()) {
        stillDue.push({ id: profile.id, nextRunAt: profile.nextRunAt });
      }
    }
    return { created, skipped, stillDue };
  }

  async remove(userId: string, id: string): Promise<void> {
    const profile = await this.findOne(userId, id);
    await this.profileRepository.softDelete({ id: profile.id, userId });
  }
}
