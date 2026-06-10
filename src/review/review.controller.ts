import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import {
  ReviewResponseDto,
  PropertyRatingDto,
} from './dto/review-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReviewEligibilityGuard } from './guards/review-eligibility.guard';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('reviews')
@Controller()
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  // ─── Public ───────────────────────────────────────────────────────────────

  /**
   * GET /properties/:propertyId/reviews
   * Всі відгуки об'єкта для публічної сторінки.
   */
  @Get('properties/:propertyId/reviews')
  @Public()
  @ApiOperation({ summary: "Відгуки об'єкта (публічний доступ)" })
  @ApiParam({ name: 'propertyId' })
  @ApiResponse({ status: 200, type: [ReviewResponseDto] })
  findByProperty(
    @Param('propertyId') propertyId: string,
  ): Promise<ReviewResponseDto[]> {
    return this.reviewService.findByProperty(propertyId);
  }

  /**
   * GET /properties/:propertyId/rating
   * Короткий агрегований рейтинг — для карточок у маркетплейсі.
   */
  @Get('properties/:propertyId/rating')
  @Public()
  @ApiOperation({
    summary: "Рейтинг об'єкта (середнє + кількість відгуків)",
  })
  @ApiParam({ name: 'propertyId' })
  @ApiResponse({ status: 200, type: PropertyRatingDto })
  getRating(
    @Param('propertyId') propertyId: string,
  ): Promise<PropertyRatingDto> {
    return this.reviewService.getRating(propertyId);
  }

  /**
   * GET /bookings/:bookingId/review
   * Перевірка: чи вже залишив клієнт відгук для цього бронювання.
   * Фронт використовує щоб показати/сховати кнопку "Залишити відгук".
   */
  @Get('bookings/:bookingId/review')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Отримати відгук для бронювання (або null якщо ще немає)',
  })
  @ApiParam({ name: 'bookingId' })
  @ApiResponse({
    status: 200,
    type: ReviewResponseDto,
    description: 'Відгук або null',
  })
  findByBooking(
    @Param('bookingId') bookingId: string,
  ): Promise<ReviewResponseDto | null> {
    return this.reviewService.findByBooking(bookingId);
  }

  // ─── Protected ────────────────────────────────────────────────────────────

  /**
   * POST /bookings/:bookingId/review
   *
   * Залишити відгук. Guard ReviewEligibilityGuard перевіряє:
   *   - booking.status === COMPLETED
   *   - booking.userId === currentUser.id
   *   - відгук ще не існує для цього bookingId
   */
  @Post('bookings/:bookingId/review')
  @UseGuards(JwtAuthGuard, ReviewEligibilityGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Залишити відгук',
    description:
      'Доступно лише для клієнта з COMPLETED бронюванням. Один відгук на одне бронювання.',
  })
  @ApiParam({ name: 'bookingId' })
  @ApiResponse({ status: 201, type: ReviewResponseDto })
  @ApiResponse({
    status: 403,
    description: 'Бронювання не завершено або відгук вже є',
  })
  @ApiResponse({
    status: 409,
    description: 'Відгук для цього бронювання вже існує',
  })
  create(
    @Param('bookingId') bookingId: string,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewService.create(bookingId, dto);
  }
}
