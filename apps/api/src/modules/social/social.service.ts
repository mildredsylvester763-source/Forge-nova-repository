import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SocialPost } from './entities/social-post.entity';
import { planCancelPost, planSchedulePost } from './engine/social-engine';

// NOTE: nothing is transmitted here. There is no social platform adapter
// in this codebase yet, so a post is honestly SCHEDULED with its planned
// moment and the owner can cancel it any time before then. The due list
// is the honest handoff: it shows what is ready, and it never claims a
// post was delivered. No fake "posted" status.

@Injectable()
export class SocialService {
  constructor(
    @InjectRepository(SocialPost)
    private readonly posts: Repository<SocialPost>,
  ) {}

  async createPost(
    ownerUserId: string,
    rawText: string,
    rawPlatforms: unknown,
    scheduledAtMs: number,
  ): Promise<SocialPost> {
    const plan = planSchedulePost({
      rawText,
      rawPlatforms,
      nowMs: Date.now(),
      scheduledAtMs,
    });
    if (!plan.ok) throw new BadRequestException(plan.reason);
    return this.posts.save(
      this.posts.create({
        userId: ownerUserId,
        text: plan.value.text,
        platforms: plan.value.platforms,
        status: 'scheduled',
        plannedAt: new Date(plan.value.scheduledAtMs),
        cancelledAt: null,
        createdAt: new Date(),
      }),
    );
  }

  async cancelPost(ownerUserId: string, postId: string): Promise<SocialPost> {
    const post = await this.posts.findOne({
      where: { id: postId, userId: ownerUserId },
    });
    if (!post) throw new BadRequestException('social-not-found');
    const plan = planCancelPost(post.status);
    if (!plan.ok) throw new BadRequestException(plan.reason);
    post.status = plan.value;
    post.cancelledAt = new Date();
    return this.posts.save(post);
  }

  async listPosts(ownerUserId: string): Promise<SocialPost[]> {
    return this.posts.find({ where: { userId: ownerUserId } });
  }

  // What is due right now for this owner: scheduled posts whose planned
  // moment has passed. Cancellation survives, delivery does not happen.
  async listDue(ownerUserId: string): Promise<SocialPost[]> {
    const all = await this.posts.find({ where: { userId: ownerUserId } });
    const nowMs = Date.now();
    return all.filter(
      (post) => post.status === 'scheduled' && new Date(post.plannedAt).getTime() <= nowMs,
    );
  }
}
