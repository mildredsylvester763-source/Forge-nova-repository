import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReviewRequest } from './entities/review-request.entity';
import { ReviewResponse } from './entities/review-response.entity';
import {
  planReviewRequest,
  buildRequestMessage,
} from './engine/review-request-engine';
import { buildReviewResponse } from './engine/review-response-engine';

// ---------------------------------------------------------- review requests
// NOTE: nothing is transmitted here. There is no email/SMS/WhatsApp
// adapter in this codebase yet, so a request is honestly RECORDED with
// its exact message, and the status says so. No fake "sent" claims.

@Injectable()
export class ReviewRequestService {
  constructor(
    @InjectRepository(ReviewRequest)
    private readonly requests: Repository<ReviewRequest>,
  ) {}

  async requestReview(
    ownerUserId: string,
    customerRef: string,
    customerName: string,
    channel: string,
    reviewLink: string,
  ): Promise<ReviewRequest> {
    const history = await this.requests.find({
      where: { ownerUserId, customerRef },
    });
    const nowMs = Date.now();
    const nowYear = new Date(nowMs).getUTCFullYear();
    let lastRequestAtMs: number | null = null;
    let requestsThisYear = 0;
    for (const row of history) {
      const at = new Date(row.createdAt).getTime();
      if (lastRequestAtMs === null || at > lastRequestAtMs) lastRequestAtMs = at;
      if (new Date(row.createdAt).getUTCFullYear() === nowYear) {
        requestsThisYear += 1;
      }
    }
    const plan = planReviewRequest({
      nowMs,
      lastRequestAtMs,
      requestsThisYear,
      customerName,
      channel,
    });
    if (!plan.ok) throw new BadRequestException(plan.reason);
    const message = buildRequestMessage(customerName, customerName, reviewLink);
    if (!message.ok) throw new BadRequestException(message.reason);
    return this.requests.save(
      this.requests.create({
        ownerUserId,
        customerRef,
        customerName,
        channel,
        status: 'recorded',
        message: message.value.message,
        createdAt: new Date(nowMs),
      }),
    );
  }

  async listRequests(ownerUserId: string): Promise<ReviewRequest[]> {
    return this.requests.find({ where: { ownerUserId } });
  }
}

// ------------------------------------------------------- response drafting
// DRAFTS a reply to a review. Deterministic, editable, never auto-posted.

@Injectable()
export class ReviewResponseService {
  constructor(
    @InjectRepository(ReviewResponse)
    private readonly responses: Repository<ReviewResponse>,
  ) {}

  async draftResponse(
    ownerUserId: string,
    rating: number,
    reviewText: string,
    customerName: string,
    tone: string,
  ): Promise<ReviewResponse> {
    const verdict = buildReviewResponse({ rating, reviewText, customerName, tone });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return this.responses.save(
      this.responses.create({
        ownerUserId,
        rating,
        reviewText,
        customerName,
        tone,
        draftText: verdict.value.response,
        createdAt: new Date(),
      }),
    );
  }

  async listResponses(ownerUserId: string): Promise<ReviewResponse[]> {
    return this.responses.find({ where: { ownerUserId } });
  }
}
