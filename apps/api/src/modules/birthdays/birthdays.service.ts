import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Birthday } from './entities/birthday.entity';
import { BirthdayOutbox } from './entities/birthday-outbox.entity';
import {
  MAX_NAME_LENGTH,
  planBirthdayGreeting,
  pickVariant,
  shouldSendBirthday,
  validateMonthDay,
} from './engine/birthday-messages';

@Injectable()
export class BirthdaysService {
  constructor(
    @InjectRepository(Birthday)
    private readonly birthdays: Repository<Birthday>,
    @InjectRepository(BirthdayOutbox)
    private readonly outbox: Repository<BirthdayOutbox>,
  ) {}

  async upsertBirthday(
    ownerUserId: string,
    name: string,
    birthMonthDay: string,
  ): Promise<Birthday> {
    const verdict = validateMonthDay(birthMonthDay);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    if (typeof name !== 'string' || !name.trim().length) {
      throw new BadRequestException('birthday-invalid-name');
    }
    const clean = name.trim();
    if (clean.length > MAX_NAME_LENGTH) {
      throw new BadRequestException('birthday-name-length');
    }
    const existing = await this.birthdays.findOne({
      where: { ownerUserId, name: clean },
    });
    if (existing) {
      existing.birthMonthDay = verdict.value.monthDay;
      return this.birthdays.save(existing);
    }
    return this.birthdays.save(
      this.birthdays.create({
        ownerUserId,
        name: clean,
        birthMonthDay: verdict.value.monthDay,
        lastSentYear: null,
      }),
    );
  }

  async checkAndSend(
    ownerUserId: string,
    birthdayId: string,
    today: { year: number; monthDay: string },
  ): Promise<{ sent: boolean; message: string | null; reason: string | null }> {
    const row = await this.birthdays.findOne({ where: { id: birthdayId } });
    if (!row || row.ownerUserId !== ownerUserId) {
      throw new NotFoundException('birthday-not-found');
    }
    const verdict = shouldSendBirthday({
      todayMonthDay: today.monthDay,
      birthMonthDay: row.birthMonthDay,
      lastSentYear: row.lastSentYear,
      todayYear: today.year,
    });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    if (!verdict.value.send) {
      const reason =
        row.birthMonthDay !== today.monthDay
          ? 'birthday-not-today'
          : 'birthday-already-sent-this-year';
      return { sent: false, message: null, reason };
    }
    const greeting = planBirthdayGreeting(row.name, pickVariant(row.name, today.year));
    if (!greeting.ok) throw new BadRequestException(greeting.reason);
    await this.outbox.save(
      this.outbox.create({
        birthdayId: row.id,
        ownerUserId,
        name: row.name,
        sentYear: today.year,
        message: greeting.value.message,
      }),
    );
    row.lastSentYear = today.year;
    await this.birthdays.save(row);
    return { sent: true, message: greeting.value.message, reason: null };
  }

  async listBirthdays(ownerUserId: string): Promise<Birthday[]> {
    return this.birthdays.find({ where: { ownerUserId } });
  }

  async listOutbox(ownerUserId: string): Promise<BirthdayOutbox[]> {
    return this.outbox.find({
      where: { ownerUserId },
      order: { createdAt: 'DESC' },
    });
  }
}
