import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NpsResponse } from './entities/nps-response.entity';
import {
  classifyRating,
  computeNpsScore,
  planNpsSurvey,
  validateChannel,
  validateComment,
} from './engine/nps-engine';

// NPS survey tracking. Honest grounding: recording a response stores it with
// its computed segment; we never claim to deliver the survey itself. A
// response inside the 90-day cooldown is refused with nothing recorded.

@Injectable()
export class NpsService {
  constructor(
    @InjectRepository(NpsResponse)
    private readonly responses: Repository<NpsResponse>,
  ) {}

  async recordResponse(
    ownerUserId: string,
    customerRef: string,
    score: number,
    comment: string | null | undefined,
    channel: string,
  ): Promise<NpsResponse> {
    const ratingVerdict = classifyRating(score);
    if (!ratingVerdict.ok) throw new BadRequestException(ratingVerdict.reason);
    const commentVerdict = validateComment(comment === undefined ? null : comment);
    if (!commentVerdict.ok) throw new BadRequestException(commentVerdict.reason);
    const channelVerdict = validateChannel(channel);
    if (!channelVerdict.ok) throw new BadRequestException(channelVerdict.reason);

    const history = await this.responses.find({ where: { ownerUserId, customerRef } });
    let latestMs: number | null = null;
    for (const row of history) {
      const ts = row.createdAt ? new Date(row.createdAt).getTime() : NaN;
      if (Number.isFinite(ts) && (latestMs === null || ts > latestMs)) latestMs = ts;
    }
    const plan = planNpsSurvey(latestMs, Date.now());
    if (!plan.ok) throw new BadRequestException(plan.reason);

    const row = this.responses.create({
      ownerUserId,
      customerRef,
      score,
      segment: ratingVerdict.value,
      comment: commentVerdict.value,
      channel: channelVerdict.value,
      createdAt: new Date(),
    });
    return this.responses.save(row);
  }

  async computeScore(ownerUserId: string) {
    const rows = await this.responses.find({ where: { ownerUserId } });
    const counts = { promoters: 0, passives: 0, detractors: 0 };
    for (const row of rows) {
      if (row.segment === 'promoter') counts.promoters += 1;
      else if (row.segment === 'passive') counts.passives += 1;
      else if (row.segment === 'detractor') counts.detractors += 1;
    }
    const verdict = computeNpsScore(counts);
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict.value;
  }

  async listResponses(ownerUserId: string): Promise<NpsResponse[]> {
    return this.responses.find({ where: { ownerUserId } });
  }

  async listDetractors(ownerUserId: string): Promise<NpsResponse[]> {
    return this.responses.find({ where: { ownerUserId, segment: 'detractor' } });
  }
}
