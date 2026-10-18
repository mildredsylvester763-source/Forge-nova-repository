import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReferralCode } from './entities/referral-code.entity';
import { ReferralBinding } from './entities/referral-binding.entity';
import { ReferralReward } from './entities/referral-reward.entity';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { buildCode, decideReward, validateCode } from './engine/referral-engine';

@Injectable()
export class ReferralsService {
  constructor(
    @InjectRepository(ReferralCode)
    private readonly codes: Repository<ReferralCode>,
    @InjectRepository(ReferralBinding)
    private readonly bindings: Repository<ReferralBinding>,
    @InjectRepository(ReferralReward)
    private readonly rewards: Repository<ReferralReward>,
    private readonly loyalty: LoyaltyService,
  ) {}

  async generateCode(userId: string): Promise<ReferralCode> {
    const existing = await this.codes.findOne({ where: { userId } });
    if (existing) return existing;
    const created = this.codes.create({
      userId,
      code: buildCode(() => Math.random()),
    });
    try {
      return await this.codes.save(created);
    } catch {
      const retry = this.codes.create({
        userId,
        code: buildCode(() => Math.random()),
      });
      return this.codes.save(retry);
    }
  }

  async apply(rawCode: string, refereeId: string): Promise<ReferralBinding> {
    const verdict = validateCode(rawCode);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    const existingBinding = await this.bindings.findOne({ where: { refereeId } });
    if (existingBinding) throw new BadRequestException('referral-already-bound');
    const codeRow = await this.codes.findOne({ where: { code: verdict.value.code } });
    if (!codeRow) throw new NotFoundException('referral-code-not-found');
    if (codeRow.userId === refereeId) {
      throw new BadRequestException('referral-self-referral');
    }
    return this.bindings.save(
      this.bindings.create({ referrerId: codeRow.userId, refereeId, status: 'bound' }),
    );
  }

  async reward(refereeId: string, purchaseCents: number): Promise<ReferralReward> {
    const binding = await this.bindings.findOne({ where: { refereeId } });
    if (!binding) throw new NotFoundException('referral-not-bound');
    const verdict = decideReward({
      referrerId: binding.referrerId,
      refereeId,
      bindingExists: true,
      alreadyRewarded: binding.status === 'rewarded',
      purchaseCents,
    });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    await this.loyalty.grantPointsToUser(
      binding.referrerId,
      verdict.value.points,
      'referral reward',
    );
    binding.status = 'rewarded';
    await this.bindings.save(binding);
    return this.rewards.save(
      this.rewards.create({
        referrerId: binding.referrerId,
        refereeId,
        purchaseCents,
        points: verdict.value.points,
      }),
    );
  }

  async list(userId: string): Promise<{
    code: ReferralCode | null;
    bindings: ReferralBinding[];
    rewards: ReferralReward[];
  }> {
    const code = await this.codes.findOne({ where: { userId } });
    const bindings = await this.bindings.find({
      where: { referrerId: userId },
      order: { createdAt: 'DESC' },
    });
    const rewards = await this.rewards.find({ where: { referrerId: userId } });
    return { code, bindings, rewards };
  }
}
