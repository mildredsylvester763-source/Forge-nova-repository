import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NewsletterIssue } from './entities/newsletter-issue.entity';
import { Post } from './entities/post.entity';
import { Subscriber } from './entities/subscriber.entity';
import {
  planUnsubscribe,
  validateEmail,
  validateIssueSubject,
} from './engine/content-engine';

// NOTE: issues are honestly RECORDED, never "sent". There is no email
// delivery adapter in this codebase yet, so the status says recorded and
// no fake delivery is claimed. Same honesty rule as review requests.

@Injectable()
export class NewsletterService {
  constructor(
    @InjectRepository(NewsletterIssue)
    private readonly issues: Repository<NewsletterIssue>,
    @InjectRepository(Subscriber)
    private readonly subscribers: Repository<Subscriber>,
    @InjectRepository(Post)
    private readonly posts: Repository<Post>,
  ) {}

  async subscribe(ownerUserId: string, rawEmail: string): Promise<Subscriber> {
    const email = validateEmail(rawEmail);
    if (!email.ok) throw new BadRequestException(email.reason);
    const existing = await this.subscribers.findOne({
      where: { userId: ownerUserId, email: email.value },
    });
    if (existing) throw new BadRequestException('subscriber-email-exists');
    return this.subscribers.save(
      this.subscribers.create({
        userId: ownerUserId,
        email: email.value,
        status: 'subscribed',
        createdAt: new Date(),
      }),
    );
  }

  async unsubscribe(ownerUserId: string, rawEmail: string): Promise<Subscriber> {
    const email = validateEmail(rawEmail);
    if (!email.ok) throw new BadRequestException(email.reason);
    const row = await this.subscribers.findOne({
      where: { userId: ownerUserId, email: email.value },
    });
    if (!row) throw new BadRequestException('subscriber-not-found');
    const plan = planUnsubscribe(row);
    if (!plan.ok) throw new BadRequestException(plan.reason);
    row.status = plan.value;
    return this.subscribers.save(row);
  }

  async listSubscribers(ownerUserId: string): Promise<Subscriber[]> {
    return this.subscribers.find({ where: { userId: ownerUserId } });
  }

  async recordIssue(
    ownerUserId: string,
    rawSubject: string,
    rawPostIds: unknown,
  ): Promise<NewsletterIssue> {
    const subject = validateIssueSubject(rawSubject);
    if (!subject.ok) throw new BadRequestException(subject.reason);
    if (!Array.isArray(rawPostIds) || rawPostIds.length < 1) {
      throw new BadRequestException('issue-needs-posts');
    }
    for (const postId of rawPostIds) {
      if (typeof postId !== 'string') {
        throw new BadRequestException('issue-unknown-post');
      }
      const post = await this.posts.findOne({
        where: { id: postId, userId: ownerUserId },
      });
      if (!post) throw new BadRequestException('issue-unknown-post');
      if (post.status !== 'published') {
        throw new BadRequestException('issue-post-not-published');
      }
    }
    return this.issues.save(
      this.issues.create({
        userId: ownerUserId,
        subject: subject.value,
        postIds: rawPostIds as string[],
        status: 'recorded',
        createdAt: new Date(),
      }),
    );
  }
}
