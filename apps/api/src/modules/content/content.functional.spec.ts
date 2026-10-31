// ============================================================================
// FILE: /apps/api/src/modules/content/content.functional.spec.ts
// ============================================================================
// Functional scenario tests: the REAL PostsService, SeoService and
// NewsletterService wired to the shared in-memory repository helper.
// Multi-user reality: slug collisions across owners, one-way publishing,
// honest SEO audits, subscribe and unsubscribe flows, and honest issue
// recording (no fake sends).

import { NewsletterService } from './newsletter.service';
import { PostsService } from './posts.service';
import { SeoService } from './seo.service';
import { NewsletterIssue } from './entities/newsletter-issue.entity';
import { Post } from './entities/post.entity';
import { SeoAudit } from './entities/seo-audit.entity';
import { Subscriber } from './entities/subscriber.entity';
import { fakeRepo } from '../../common/testing/fake-repository';

interface Harness {
  posts: PostsService;
  seo: SeoService;
  newsletter: NewsletterService;
  postRows: Post[];
  auditRows: SeoAudit[];
  subscriberRows: Subscriber[];
  issueRows: NewsletterIssue[];
}

function buildHarness(): Harness {
  const posts = fakeRepo<Post>();
  const audits = fakeRepo<SeoAudit>();
  const subscribers = fakeRepo<Subscriber>();
  const issues = fakeRepo<NewsletterIssue>();
  return {
    posts: new PostsService(posts.repo),
    seo: new SeoService(audits.repo),
    newsletter: new NewsletterService(issues.repo, subscribers.repo, posts.repo),
    postRows: posts.rows,
    auditRows: audits.rows,
    subscriberRows: subscribers.rows,
    issueRows: issues.rows,
  };
}

const PERFECT = {
  title: 'Custom cakes baked fresh every morning in Lagos',
  metaDescription:
    'We bake custom cakes for birthdays and weddings across Lagos with same day delivery available on weekdays.',
  slug: 'custom-cakes-lagos',
  keyword: 'custom cakes',
  firstHeading: 'Custom cakes made for you',
  bodyText: 'words '.repeat(50),
};

describe('posts functional flows', () => {
  it('creates a draft post and refuses a duplicate slug for the same owner', async () => {
    const h = buildHarness();
    const row = await h.posts.createPost('owner-a', '  Cake Trends 2026  ', 'Cake-Trends-2026', 'x'.repeat(300));
    expect(row.status).toBe('draft');
    expect(row.publishedAt).toBeNull();
    expect(row.slug).toBe('cake-trends-2026');
    await expect(
      h.posts.createPost('owner-a', 'Again', 'cake-trends-2026', 'y'),
    ).rejects.toThrow('post-slug-exists');
    expect(h.postRows.length).toBe(1);
  });

  it('two owners may use the SAME slug independently; listings are isolated', async () => {
    const h = buildHarness();
    await h.posts.createPost('owner-a', 'Cake trends', 'cake-trends', 'a body');
    const row = await h.posts.createPost('owner-b', 'Other owner', 'cake-trends', 'b body');
    expect(row.userId).toBe('owner-b');
    expect(h.postRows.length).toBe(2);
    const listA = await h.posts.listPosts('owner-a');
    const listB = await h.posts.listPosts('owner-b');
    expect(listA.length).toBe(1);
    expect(listA[0].userId).toBe('owner-a');
    expect(listB.length).toBe(1);
    expect(listB[0].userId).toBe('owner-b');
  });

  it('publishing is a one-way door and a refused second publish changes nothing', async () => {
    const h = buildHarness();
    const created = await h.posts.createPost('owner-a', 'Cake trends', 'cake-trends', 'a body');
    const published = await h.posts.publishPost('owner-a', created.id);
    expect(published.status).toBe('published');
    expect(published.publishedAt).not.toBeNull();
    const stamp = published.publishedAt;
    await expect(h.posts.publishPost('owner-a', created.id)).rejects.toThrow(
      'post-already-published',
    );
    expect(h.postRows[0].status).toBe('published');
    expect(h.postRows[0].publishedAt).toBe(stamp);
  });

  it('an owner cannot publish a post that belongs to someone else', async () => {
    const h = buildHarness();
    const mine = await h.posts.createPost('owner-a', 'Cake trends', 'cake-trends', 'a body');
    const theirs = await h.posts.createPost('owner-b', 'Other owner', 'other-post', 'b body');
    await expect(h.posts.publishPost('owner-b', mine.id)).rejects.toThrow('post-not-found');
    expect(h.postRows.find((r) => r.id === mine.id)?.status).toBe('draft');
    expect(h.postRows.find((r) => r.id === theirs.id)?.status).toBe('draft');
  });
});

describe('seo functional flows', () => {
  it('saves an honest 8/8 audit for a strong page and a 1/8 audit for a weak one', async () => {
    const h = buildHarness();
    const strong = await h.seo.analyze('owner-a', PERFECT);
    expect(strong.score).toBe(8);
    expect(strong.checks.length).toBe(8);
    expect(strong.checks.every((check) => check.passed)).toBe(true);
    expect(strong.targetId).toBe('custom-cakes-lagos');
    const weak = await h.seo.analyze('owner-a', {
      title: 'hi',
      metaDescription: 'hi',
      slug: 'abc',
      keyword: 'cakes',
      firstHeading: null,
      bodyText: 'short body',
    });
    expect(weak.score).toBe(1);
    expect(weak.checks.find((check) => check.id === 'slug-length')?.passed).toBe(true);
    expect(weak.checks.filter((check) => check.passed)).toHaveLength(1);
    expect(h.auditRows.length).toBe(2);
  });

  it('refuses a too-short slug and leaves no audit behind', async () => {
    const h = buildHarness();
    await expect(
      h.seo.analyze('owner-a', {
        title: 'hi',
        metaDescription: 'hi',
        slug: 'hi',
        keyword: 'cakes',
        firstHeading: null,
        bodyText: 'short body',
      }),
    ).rejects.toThrow('seo-invalid-slug');
    expect(h.auditRows.length).toBe(0);
  });

  it('audit listings are isolated per owner for the same target', async () => {
    const h = buildHarness();
    await h.seo.analyze('owner-a', PERFECT);
    await h.seo.analyze('owner-b', PERFECT);
    const auditsA = await h.seo.listAudits('owner-a', 'custom-cakes-lagos');
    const auditsB = await h.seo.listAudits('owner-b', 'custom-cakes-lagos');
    expect(auditsA.length).toBe(1);
    expect(auditsA[0].userId).toBe('owner-a');
    expect(auditsB.length).toBe(1);
    expect(auditsB[0].userId).toBe('owner-b');
    expect(h.auditRows.length).toBe(2);
  });
});

describe('newsletter functional flows', () => {
  it('subscribes once per owner, refusing duplicate emails case-insensitively', async () => {
    const h = buildHarness();
    const row = await h.newsletter.subscribe('owner-a', '  Ada@Example.COM  ');
    expect(row.email).toBe('ada@example.com');
    expect(row.status).toBe('subscribed');
    await expect(h.newsletter.subscribe('owner-a', 'ada@example.com')).rejects.toThrow(
      'subscriber-email-exists',
    );
    expect(h.subscriberRows.length).toBe(1);
    // A different owner may hold the same email independently.
    const other = await h.newsletter.subscribe('owner-b', 'ada@example.com');
    expect(other.userId).toBe('owner-b');
    expect(h.subscriberRows.length).toBe(2);
  });

  it('unsubscribes once, refusing a second attempt and unknown emails', async () => {
    const h = buildHarness();
    await h.newsletter.subscribe('owner-a', 'ada@example.com');
    const row = await h.newsletter.unsubscribe('owner-a', 'ADA@example.com');
    expect(row.status).toBe('unsubscribed');
    await expect(h.newsletter.unsubscribe('owner-a', 'ada@example.com')).rejects.toThrow(
      'subscriber-already-unsubscribed',
    );
    await expect(h.newsletter.unsubscribe('owner-a', 'nobody@example.com')).rejects.toThrow(
      'subscriber-not-found',
    );
    // No new rows were created by any refused attempt.
    expect(h.subscriberRows.length).toBe(1);
  });

  it('records an issue honestly with only published posts from the same owner', async () => {
    const h = buildHarness();
    const post = await h.posts.createPost('owner-a', 'Cake trends', 'cake-trends', 'a body');
    await h.posts.publishPost('owner-a', post.id);
    const issue = await h.newsletter.recordIssue('owner-a', '  Issue 5  ', [post.id]);
    expect(issue.status).toBe('recorded');
    expect(issue.subject).toBe('Issue 5');
    expect(issue.postIds).toEqual([post.id]);
    expect(h.issueRows.length).toBe(1);
  });

  it('refuses issues with unknown, unpublished or foreign posts, leaving no row', async () => {
    const h = buildHarness();
    const draft = await h.posts.createPost('owner-a', 'Draft only', 'draft-only', 'd');
    const published = await h.posts.createPost('owner-b', 'Foreign', 'foreign-post', 'f');
    await h.posts.publishPost('owner-b', published.id);
    await expect(h.newsletter.recordIssue('owner-a', 'Issue 5', [])).rejects.toThrow(
      'issue-needs-posts',
    );
    await expect(h.newsletter.recordIssue('owner-a', 'Issue 5', ['missing'])).rejects.toThrow(
      'issue-unknown-post',
    );
    await expect(h.newsletter.recordIssue('owner-a', 'Issue 5', [draft.id])).rejects.toThrow(
      'issue-post-not-published',
    );
    await expect(h.newsletter.recordIssue('owner-a', 'Issue 5', [published.id])).rejects.toThrow(
      'issue-unknown-post',
    );
    expect(h.issueRows.length).toBe(0);
  });
});
