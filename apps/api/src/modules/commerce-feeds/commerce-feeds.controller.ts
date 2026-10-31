import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { CommerceFeedsService } from './commerce-feeds.service';
import { ListingsService } from './listings.service';
import {
  PlanShopSyncDto,
  SaveListingDto,
} from './dto/commerce-feeds.dto';

@Controller('commerce-feeds')
export class CommerceFeedsController {
  constructor(
    private readonly listingsService: ListingsService,
    private readonly feedsService: CommerceFeedsService,
  ) {}

  @Post('listings')
  async saveListing(@Request() req: any, @Body() dto: SaveListingDto) {
    return this.listingsService.saveListing(req.user.id, dto);
  }

  @Get('listings')
  async listListings(@Request() req: any) {
    return this.listingsService.listListings(req.user.id);
  }

  @Post('shop-sync')
  async planShopSync(@Request() req: any, @Body() dto: PlanShopSyncDto) {
    return this.feedsService.planShopSync(req.user.id, dto.channel, dto.variantId);
  }

  @Get('shop-syncs')
  async listShopSyncs(
    @Request() req: any,
    @Query('channel') channel?: string,
  ) {
    return this.feedsService.listShopSyncs(req.user.id, channel);
  }

  @Post('google-feed')
  async generateGoogleFeed(@Request() req: any) {
    return this.feedsService.generateGoogleFeed(req.user.id);
  }

  @Get('google-feeds')
  async listFeeds(@Request() req: any) {
    return this.feedsService.listFeeds(req.user.id);
  }
}
