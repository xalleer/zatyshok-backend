import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { ReviewEligibilityGuard } from './guards/review-eligibility.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ReviewController],
  providers: [ReviewService, ReviewEligibilityGuard],
  exports: [ReviewService],
})
export class ReviewModule {}
