import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from './entities/post.entity';
import {
  planPublishPost,
  validatePostBody,
  validatePostSlug,
  validatePostTitle,
} from './engine/content-engine';

// Blog posts: created as drafts, published once. Publishing is a one-way
// door, and slugs are unique per owner so two owners may reuse a slug.

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post)
    private readonly posts: Repository<Post>,
  ) {}

  async createPost(
    ownerUserId: string,
    rawTitle: string,
    rawSlug: string,
    rawBody: string,
  ): Promise<Post> {
    const title = validatePostTitle(rawTitle);
    if (!title.ok) throw new BadRequestException(title.reason);
    const slug = validatePostSlug(rawSlug);
    if (!slug.ok) throw new BadRequestException(slug.reason);
    const body = validatePostBody(rawBody);
    if (!body.ok) throw new BadRequestException(body.reason);
    const existing = await this.posts.findOne({
      where: { userId: ownerUserId, slug: slug.value },
    });
    if (existing) throw new BadRequestException('post-slug-exists');
    return this.posts.save(
      this.posts.create({
        userId: ownerUserId,
        title: title.value,
        slug: slug.value,
        body: body.value,
        status: 'draft',
        publishedAt: null,
        createdAt: new Date(),
      }),
    );
  }

  async publishPost(ownerUserId: string, postId: string): Promise<Post> {
    const post = await this.posts.findOne({
      where: { id: postId, userId: ownerUserId },
    });
    if (!post) throw new BadRequestException('post-not-found');
    const plan = planPublishPost(post.status);
    if (!plan.ok) throw new BadRequestException(plan.reason);
    post.status = plan.value;
    post.publishedAt = new Date();
    return this.posts.save(post);
  }

  async listPosts(ownerUserId: string): Promise<Post[]> {
    return this.posts.find({ where: { userId: ownerUserId } });
  }
}
