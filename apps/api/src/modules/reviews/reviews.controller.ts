import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { ReviewRequestService, ReviewResponseService } from './reviews.service';
import { DraftReviewResponseDto, RequestReviewDto } from './dto/reviews.dto';

@Controller('reviews')
export class ReviewsController {
  constructor(
    private readonly reviewRequests: ReviewRequestService,
    private readonly reviewResponses: ReviewResponseService,
  ) {}

  @Post('requests')
  async requestReview(@Request() req: any, @Body() dto: RequestReviewDto) {
    return this.reviewRequests.requestReview(
      req.user.id,
      dto.customerRef,
      dto.customerName,
      dto.channel,
      dto.reviewLink,
    );
  }

  @Get('requests')
  async listRequests(@Request() req: any) {
    return this.reviewRequests.listRequests(req.user.id);
  }

  @Post('responses')
  async draftResponse(@Request() req: any, @Body() dto: DraftReviewResponseDto) {
    return this.reviewResponses.draftResponse(
      req.user.id,
      dto.rating,
      dto.reviewText,
      dto.customerName,
      dto.tone,
    );
  }

  @Get('responses')
  async listResponses(@Request() req: any) {
    return this.reviewResponses.listResponses(req.user.id);
  }
}
