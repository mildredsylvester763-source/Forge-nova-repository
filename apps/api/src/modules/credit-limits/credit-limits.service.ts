import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerCredit } from './entities/customer-credit.entity';
import { CreditEvent } from './entities/credit-event.entity';
import {
  decideCharge,
  decideLimitChange,
  decideRelease,
  validateLimit,
  validateReason,
} from './engine/credit-limits-engine';

// Credit accounts per customer. Every decision goes through the pure
// engine first; a refused decision changes NOTHING (no event row, no
// balance change), which the functional spec verifies.

@Injectable()
export class CreditService {
  constructor(
    @InjectRepository(CustomerCredit)
    private readonly credits: Repository<CustomerCredit>,
    @InjectRepository(CreditEvent)
    private readonly events: Repository<CreditEvent>,
  ) {}

  private async getAccount(ownerUserId: string, customerRef: string): Promise<CustomerCredit> {
    const existing = await this.credits.findOne({ where: { ownerUserId, customerRef } });
    if (existing) return existing;
    const fresh = this.credits.create({ ownerUserId, customerRef, limitCents: 0, usedCents: 0 });
    return this.credits.save(fresh);
  }

  private async record(
    account: CustomerCredit,
    kind: string,
    amountCents: number,
    reason: string,
  ): Promise<void> {
    await this.events.save(
      this.events.create({
        ownerUserId: account.ownerUserId,
        customerRef: account.customerRef,
        kind,
        amountCents,
        usedAfterCents: account.usedCents,
        limitAfterCents: account.limitCents,
        reason,
      }),
    );
  }

  async setLimit(ownerUserId: string, customerRef: string, newLimitCents: number): Promise<CustomerCredit> {
    const limitVerdict = validateLimit(newLimitCents);
    if (!limitVerdict.ok) throw new BadRequestException(limitVerdict.reason);
    const account = await this.getAccount(ownerUserId, customerRef);
    const verdict = decideLimitChange({
      currentLimitCents: account.limitCents,
      usedCents: account.usedCents,
      newLimitCents,
    });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    account.limitCents = verdict.value.limitAfterCents;
    const saved = await this.credits.save(account);
    await this.record(saved, 'limit-set', newLimitCents, 'limit set by owner');
    return saved;
  }

  async charge(ownerUserId: string, customerRef: string, chargeCents: number, reason: string): Promise<CustomerCredit> {
    const reasonVerdict = validateReason(reason);
    if (!reasonVerdict.ok) throw new BadRequestException(reasonVerdict.reason);
    const account = await this.getAccount(ownerUserId, customerRef);
    const verdict = decideCharge({
      limitCents: account.limitCents,
      usedCents: account.usedCents,
      chargeCents,
    });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    account.usedCents = verdict.value.usedAfterCents;
    const saved = await this.credits.save(account);
    await this.record(saved, 'charge', chargeCents, reason);
    return saved;
  }

  async release(ownerUserId: string, customerRef: string, releaseCents: number, reason: string): Promise<CustomerCredit> {
    const reasonVerdict = validateReason(reason);
    if (!reasonVerdict.ok) throw new BadRequestException(reasonVerdict.reason);
    const account = await this.getAccount(ownerUserId, customerRef);
    const verdict = decideRelease({
      usedCents: account.usedCents,
      releaseCents,
    });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    account.usedCents = verdict.value.usedAfterCents;
    const saved = await this.credits.save(account);
    await this.record(saved, 'release', releaseCents, reason);
    return saved;
  }

  async getCredit(ownerUserId: string, customerRef: string): Promise<CustomerCredit> {
    const account = await this.credits.findOne({ where: { ownerUserId, customerRef } });
    if (!account) throw new NotFoundException('credit-account-not-found');
    return account;
  }

  async listCredits(ownerUserId: string): Promise<CustomerCredit[]> {
    return this.credits.find({ where: { ownerUserId } });
  }

  async listEvents(ownerUserId: string): Promise<CreditEvent[]> {
    return this.events.find({ where: { ownerUserId } });
  }
}
