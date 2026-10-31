// ============================================================================
// FILE: /apps/api/src/modules/social/social.functional.spec.ts
// ============================================================================
// Functional scenario tests: the REAL SocialService wired to the shared
// in-memory repository helper. Multi-user reality: two owners scheduling
// independently, honest scheduling (no fake delivery), one-way
// cancellation, and a due list that shows exactly what is ready.

import { SocialService } from './social.service';
import { SocialPost } from './entities/social-post.entity';
import { fakeRepo } from '../../common/testing/fake-repository';

const HOUR = 3600000;

interface Harness {
  social: SocialService;
  rows: SocialPost[];
}

function buildHarness(): Harness {
  const db = fakeRepo<SocialPost>();
  return { social: new SocialService(db.repo), rows: db.rows };
}

describe('social scheduling functional flows', () => {
  it('schedules a post honestly with deduplicated sorted platforms', async () => {
    const h = buildHarness();
    const row = await h.social.createPost('owner-a', '  Big sale tomorrow  ', ['x', 'x', 'facebook'], Date.now() + HOUR);
    expect(row.status).toBe('scheduled');
    expect(row.cancelledAt).toBeNull();
    expect(row.text).toBe('Big sale tomorrow');
    expect(row.platforms).toEqual(['facebook', 'x']);
    expect(row.plannedAt).not.toBeNull();
    expect(h.rows.length).toBe(1);
  });

  it('refuses long text, past moments, far futures and bad platforms, leaving no row', async () => {
    const h = buildHarness();
    const ahead = Date.now() + HOUR;
    await expect(h.social.createPost('owner-a', 'y'.repeat(501), ['threads'], ahead)).rejects.toThrow(
      'social-text-too-long-for-threads',
    );
    await expect(h.social.createPost('owner-a', 'ok', ['facebook'], Date.now() - 1000)).rejects.toThrow(
      'social-invalid-scheduled-at',
    );
    await expect(
      h.social.createPost('owner-a', 'ok', ['facebook'], Date.now() + 365 * 24 * 3600 * 1000 + 10),
    ).rejects.toThrow('social-schedule-too-far');
    await expect(h.social.createPost('owner-a', 'ok', ['nope'], ahead)).rejects.toThrow(
      'social-invalid-platform',
    );
    await expect(h.social.createPost('owner-a', 'ok', [], ahead)).rejects.toThrow(
      'social-needs-platforms',
    );
    expect(h.rows.length).toBe(0);
  });

  it('two owners schedule independently and listings stay isolated', async () => {
    const h = buildHarness();
    const mine = await h.social.createPost('owner-a', 'My post', ['x'], Date.now() + HOUR);
    const theirs = await h.social.createPost('owner-b', 'Their post', ['facebook'], Date.now() + HOUR);
    expect(mine.userId).toBe('owner-a');
    expect(theirs.userId).toBe('owner-b');
    expect(h.rows.length).toBe(2);
    const listA = await h.social.listPosts('owner-a');
    const listB = await h.social.listPosts('owner-b');
    expect(listA.length).toBe(1);
    expect(listA[0].userId).toBe('owner-a');
    expect(listB.length).toBe(1);
    expect(listB[0].userId).toBe('owner-b');
  });

  it('cancelling works once; a second attempt changes nothing', async () => {
    const h = buildHarness();
    const post = await h.social.createPost('owner-a', 'My post', ['x'], Date.now() + HOUR);
    const cancelled = await h.social.cancelPost('owner-a', post.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAt).not.toBeNull();
    const stamp = cancelled.cancelledAt;
    await expect(h.social.cancelPost('owner-a', post.id)).rejects.toThrow(
      'social-already-cancelled',
    );
    expect(h.rows.find((r) => r.id === post.id)?.status).toBe('cancelled');
    expect(h.rows.find((r) => r.id === post.id)?.cancelledAt).toBe(stamp);
  });

  it('an owner cannot cancel a post that belongs to someone else', async () => {
    const h = buildHarness();
    const mine = await h.social.createPost('owner-a', 'My post', ['x'], Date.now() + HOUR);
    const theirs = await h.social.createPost('owner-b', 'Their post', ['facebook'], Date.now() + HOUR);
    await expect(h.social.cancelPost('owner-b', mine.id)).rejects.toThrow('social-not-found');
    expect(h.rows.find((r) => r.id === mine.id)?.status).toBe('scheduled');
    expect(h.rows.find((r) => r.id === theirs.id)?.status).toBe('scheduled');
  });

  it('the due list shows only this owner posts whose moment has passed', async () => {
    const h = buildHarness();
    const now = Date.now();
    h.rows.push(
      {
        id: 'seed-due',
        userId: 'owner-a',
        text: 'due now',
        platforms: ['x'],
        status: 'scheduled',
        plannedAt: new Date(now - 60000),
        cancelledAt: null,
        createdAt: new Date(),
        deletedAt: null,
      } as unknown as SocialPost,
      {
        id: 'seed-future',
        userId: 'owner-a',
        text: 'later',
        platforms: ['x'],
        status: 'scheduled',
        plannedAt: new Date(now + 60000),
        cancelledAt: null,
        createdAt: new Date(),
        deletedAt: null,
      } as unknown as SocialPost,
      {
        id: 'seed-cancelled',
        userId: 'owner-a',
        text: 'gone',
        platforms: ['x'],
        status: 'cancelled',
        plannedAt: new Date(now - 60000),
        cancelledAt: new Date(),
        createdAt: new Date(),
        deletedAt: null,
      } as unknown as SocialPost,
      {
        id: 'seed-other-owner',
        userId: 'owner-b',
        text: 'theirs due',
        platforms: ['x'],
        status: 'scheduled',
        plannedAt: new Date(now - 60000),
        cancelledAt: null,
        createdAt: new Date(),
        deletedAt: null,
      } as unknown as SocialPost,
    );
    const due = await h.social.listDue('owner-a');
    expect(due.length).toBe(1);
    expect(due[0].id).toBe('seed-due');
    const dueB = await h.social.listDue('owner-b');
    expect(dueB.length).toBe(1);
    expect(dueB[0].id).toBe('seed-other-owner');
  });
});
