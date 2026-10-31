import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import { CreateSocialPostDto } from './dto/social.dto';
import { SocialService } from './social.service';

@Controller('social')
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Post('posts')
  async createPost(@Request() req: any, @Body() dto: CreateSocialPostDto) {
    return this.social.createPost(req.user.id, dto.text, dto.platforms, dto.scheduledAtMs);
  }

  @Get('posts')
  async listPosts(@Request() req: any) {
    return this.social.listPosts(req.user.id);
  }

  @Post('posts/:id/cancel')
  async cancelPost(@Request() req: any, @Param('id') postId: string) {
    return this.social.cancelPost(req.user.id, postId);
  }

  @Get('posts/due')
  async listDue(@Request() req: any) {
    return this.social.listDue(req.user.id);
  }
}
