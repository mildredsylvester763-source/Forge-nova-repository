import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoyaltyAccount } from './entities/loyalty-account.entity';
import { LoyaltyEvent } from './entities/loyalty-event.entity';
import { accruePoints, grantPoints, redeemPoints } from './engine/loyalty-points';

@Injectable()
export class LoyaltyService {
  constructor(
    @InjectRepository(LoyaltyAccount)
    private readonly accounts: Repository<LoyaltyAccount>,
    @InjectRepository(LoyaltyEvent)
    private readonly events: Repository<LoyaltyEvent>,
  ) {}

  private async ensureAccount(userId: string): Promise<LoyaltyAccount> {
    const existing = await this.accounts.findOne({ where: { userId } });
    if (existing) return existing;
    const created = this.accounts.create({ userId, pointsBalance: 0, lifetimePoints: 0 });
    return this.accounts.save(created);
  }

  private async recordEvent(
    userId: string,
    kind: string,
    points: number,
    reason: string,
    balanceAfter: number,
  ): Promise<void> {
    await this.events.save(
      this.events.create({ userId, kind, points, reason, balanceAfter }),
    );
  }

  async earn(userId: string, amountCents: number, reason: string): Promise<LoyaltyAccount> {
    const verdict = accruePoints(amountCents, reason);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    const account = await this.ensureAccount(userId);
    account.pointsBalance += verdict.value.points;
    account.lifetimePoints += verdict.value.points;
    const saved = await this.accounts.save(account);
    await this.recordEvent(userId, 'earn', verdict.value.points, reason, saved.pointsBalance);
    return saved;
  }

  async redeem(userId: string, points: number, reason: string): Promise<LoyaltyAccount> {
    const account = await this.ensureAccount(userId);
    const verdict = redeemPoints(account.pointsBalance, points, reason);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    account.pointsBalance = verdict.value.balanceAfter;
    const saved = await this.accounts.save(account);
    await this.recordEvent(userId, 'redeem', -points, reason, saved.pointsBalance);
    return saved;
  }

  async grantPointsToUser(
    userId: string,
    points: number,
    reason: string,
  ): Promise<LoyaltyAccount> {
    const account = await this.ensureAccount(userId);
    const verdict = grantPoints(account.pointsBalance, points, reason);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    account.pointsBalance = verdict.value.balanceAfter;
    account.lifetimePoints += points;
    const saved = await this.accounts.save(account);
    await this.recordEvent(userId, 'grant', points, reason, saved.pointsBalance);
    return saved;
  }

  async getAccount(userId: string): Promise<LoyaltyAccount> {
    return this.ensureAccount(userId);
  }

  async listEvents(userId: string): Promise<LoyaltyEvent[]> {
    return this.events.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }
}
