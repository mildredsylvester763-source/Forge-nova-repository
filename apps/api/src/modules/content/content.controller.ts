import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import {
  AnalyzeSeoDto,
  CreatePostDto,
  RecordIssueDto,
  SubscribeDto,
} from './dto/content.dto';
import { NewsletterService } from './newsletter.service';
import { PostsService } from './posts.service';
import { SeoService } from './seo.service';

@Controller('content')
export class ContentController {
  constructor(
    private readonly posts: PostsService,
    private readonly seo: SeoService,
    private readonly newsletter: NewsletterService,
  ) {}

  @Post('posts')
  async createPost(@Request() req: any, @Body() dto: CreatePostDto) {
    return this.posts.createPost(req.user.id, dto.title, dto.slug, dto.body);
  }

  @Get('posts')
  async listPosts(@Request() req: any) {
    return this.posts.listPosts(req.user.id);
  }

  @Post('posts/:id/publish')
  async publishPost(@Request() req: any, @Param('id') postId: string) {
    return this.posts.publishPost(req.user.id, postId);
  }

  @Post('seo/analyze')
  async analyze(@Request() req: any, @Body() dto: AnalyzeSeoDto) {
    return this.seo.analyze(req.user.id, {
      title: dto.title,
      metaDescription: dto.metaDescription,
      slug: dto.slug,
      keyword: dto.keyword,
      firstHeading: dto.firstHeading ?? null,
      bodyText: dto.bodyText,
      targetId: dto.targetId,
    });
  }

  @Get('seo/audits/:targetId')
  async listAudits(@Request() req: any, @Param('targetId') targetId: string) {
    return this.seo.listAudits(req.user.id, targetId);
  }

  @Post('subscribers')
  async subscribe(@Request() req: any, @Body() dto: SubscribeDto) {
    return this.newsletter.subscribe(req.user.id, dto.email);
  }

  @Post('subscribers/:email/unsubscribe')
  async unsubscribe(@Request() req: any, @Param('email') email: string) {
    return this.newsletter.unsubscribe(req.user.id, email);
  }

  @Get('subscribers')
  async listSubscribers(@Request() req: any) {
    return this.newsletter.listSubscribers(req.user.id);
  }

  @Post('newsletter/issues')
  async recordIssue(@Request() req: any, @Body() dto: RecordIssueDto) {
    return this.newsletter.recordIssue(req.user.id, dto.subject, dto.postIds);
  }
}
