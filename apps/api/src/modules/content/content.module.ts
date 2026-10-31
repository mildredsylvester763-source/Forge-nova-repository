import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsletterIssue } from './entities/newsletter-issue.entity';
import { Post } from './entities/post.entity';
import { SeoAudit } from './entities/seo-audit.entity';
import { Subscriber } from './entities/subscriber.entity';
import { ContentController } from './content.controller';
import { NewsletterService } from './newsletter.service';
import { PostsService } from './posts.service';
import { SeoService } from './seo.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, Subscriber, NewsletterIssue, SeoAudit]),
  ],
  controllers: [ContentController],
  providers: [PostsService, SeoService, NewsletterService],
  exports: [PostsService, SeoService, NewsletterService],
})
export class ContentModule {}
