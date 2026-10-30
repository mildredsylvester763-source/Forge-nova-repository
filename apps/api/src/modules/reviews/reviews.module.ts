import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewRequest } from './entities/review-request.entity';
import { ReviewResponse } from './entities/review-response.entity';
import { ReviewsController } from './reviews.controller';
import { ReviewRequestService, ReviewResponseService } from './reviews.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReviewRequest, ReviewResponse])],
  controllers: [ReviewsController],
  providers: [ReviewRequestService, ReviewResponseService],
  exports: [ReviewRequestService, ReviewResponseService],
})
export class ReviewsModule {}
