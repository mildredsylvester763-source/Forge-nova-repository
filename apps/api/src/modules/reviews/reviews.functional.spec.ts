// ============================================================================
// FILE: /apps/api/src/modules/reviews/reviews.functional.spec.ts
// ============================================================================
// Functional scenario tests: the REAL ReviewRequestService and
// ReviewResponseService wired to the shared in-memory repository helper.
// Multi-user reality: two owners racing the same customer, cooldowns,
// yearly caps, ownership isolation, and honest recording (no fake sends).

import { Repository } from 'typeorm';
import { ReviewRequestService, ReviewResponseService } from './reviews.service';
import { ReviewRequest } from './entities/review-request.entity';
import { ReviewResponse } from './entities/review-response.entity';
import { fakeRepo } from '../../common/testing/fake-repository';

const DAY_MS = 86400000;
const LINK = 'https://reviews.example/ada';

interface Harness {
  requests: ReviewRequestService;
  responses: ReviewResponseService;
  requestRows: ReviewRequest[];
  responseRows: ReviewResponse[];
}

function buildHarness(): Harness {
  const req = fakeRepo<ReviewRequest>();
  const res = fakeRepo<ReviewResponse>();
  const requests = new ReviewRequestService(req.repo);
  const responses = new ReviewResponseService(res.repo);
  return {
    requests,
    responses,
    requestRows: req.rows,
    responseRows: res.rows,
  };
}

describe('review-request functional flows', () => {
  it('records a first request with the exact message and honest status', async () => {
    const h = buildHarness();
    const row = await h.requests.requestReview('owner-a', 'cust-1', 'Ada', 'email', LINK);
    expect(row.status).toBe('recorded');
    expect(row.message).toContain('Ada');
    expect(row.message).toContain(LINK);
    expect(h.requestRows.length).toBe(1);
  });

  it('two owners can ask the SAME customer independently; cooldowns are per owner', async () => {
    const h = buildHarness();
    await h.requests.requestReview('owner-a', 'cust-1', 'Ada', 'email', LINK);
    // A different owner asking the same customer is NOT blocked by owner A
    // request history.
    const row = await h.requests.requestReview('owner-b', 'cust-1', 'Ada', 'email', LINK);
    expect(row.ownerUserId).toBe('owner-b');
    expect(h.requestRows.length).toBe(2);
    // But the same owner asking again IS blocked by the cooldown.
    await expect(
      h.requests.requestReview('owner-a', 'cust-1', 'Ada', 'email', LINK),
    ).rejects.toThrow('review-request-too-frequent');
    expect(h.requestRows.length).toBe(2);
  });

  it('the cooldown blocks one customer but not another customer of the same owner', async () => {
    const h = buildHarness();
    await h.requests.requestReview('owner-a', 'cust-1', 'Ada', 'email', LINK);
    await expect(
      h.requests.requestReview('owner-a', 'cust-1', 'Ada', 'sms', LINK),
    ).rejects.toThrow('review-request-too-frequent');
    // A different customer is untouched by cust-1 is cooldown.
    const row = await h.requests.requestReview('owner-a', 'cust-2', 'Bob', 'sms', LINK);
    expect(row.customerRef).toBe('cust-2');
    expect(h.requestRows.length).toBe(2);
  });

  it('enforces the yearly cap of 4 per owner and customer', async () => {
    const h = buildHarness();
    // Seed 4 requests earlier this year, each outside the cooldown window.
    const now = Date.now();
    for (let i = 0; i < 4; i++) {
      h.requestRows.push({
        id: 'seed-' + i,
        ownerUserId: 'owner-a',
        customerRef: 'cust-1',
        customerName: 'Ada',
        channel: 'email',
        status: 'recorded',
        message: 'seed',
        createdAt: new Date(now - (40 + i * 40) * DAY_MS),
      } as unknown as ReviewRequest);
    }
    await expect(
      h.requests.requestReview('owner-a', 'cust-1', 'Ada', 'whatsapp', LINK),
    ).rejects.toThrow('review-request-yearly-cap-exceeded');
    // No row was added by the refused attempt.
    expect(h.requestRows.length).toBe(4);
  });

  it('listing shows only the owner is own requests', async () => {
    const h = buildHarness();
    await h.requests.requestReview('owner-a', 'cust-1', 'Ada', 'email', LINK);
    await h.requests.requestReview('owner-b', 'cust-2', 'Bob', 'sms', LINK);
    const listA = await h.requests.listRequests('owner-a');
    const listB = await h.requests.listRequests('owner-b');
    expect(listA.length).toBe(1);
    expect(listA[0].ownerUserId).toBe('owner-a');
    expect(listB.length).toBe(1);
    expect(listB[0].ownerUserId).toBe('owner-b');
  });
});

describe('review-response functional flows', () => {
  it('drafts and stores a response the owner can edit before sending', async () => {
    const h = buildHarness();
    const row = await h.responses.draftResponse('owner-a', 5, 'Loved it', 'Ada', 'warm');
    expect(row.draftText).toContain('Ada');
    expect(row.draftText).toContain('Loved it');
    expect(h.responseRows.length).toBe(1);
  });

  it('refuses tone mismatches and leaves no row behind', async () => {
    const h = buildHarness();
    await expect(
      h.responses.draftResponse('owner-a', 5, 'Great', 'Ada', 'apologetic'),
    ).rejects.toThrow('review-response-tone-mismatch');
    expect(h.responseRows.length).toBe(0);
  });

  it('drafts are deterministic: same review, same draft, for any owner', async () => {
    const h = buildHarness();
    const a = await h.responses.draftResponse('owner-a', 4, 'Good bread', 'Ada', 'professional');
    const b = await h.responses.draftResponse('owner-b', 4, 'Good bread', 'Ada', 'professional');
    expect(a.draftText).toBe(b.draftText);
    expect(h.responseRows.length).toBe(2);
  });

  it('listing shows only the owner is own drafts', async () => {
    const h = buildHarness();
    await h.responses.draftResponse('owner-a', 5, 'Great', 'Ada', 'warm');
    await h.responses.draftResponse('owner-b', 2, 'Bad', 'Bob', 'apologetic');
    const listA = await h.responses.listResponses('owner-a');
    expect(listA.length).toBe(1);
    expect(listA[0].rating).toBe(5);
    const listB = await h.responses.listResponses('owner-b');
    expect(listB.length).toBe(1);
    expect(listB[0].rating).toBe(2);
  });
});
