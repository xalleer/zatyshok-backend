import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import {
  ReviewResponseDto,
  PropertyRatingDto,
} from './dto/review-response.dto';
import { PropertyStatus } from '../../prisma/generated/enums';
import { RATING_HIDE_THRESHOLD, RATING_MIN_REVIEWS } from './review.constants';

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private formatReview(
    review: any,
    bookingId: string | null = null,
  ): ReviewResponseDto {
    return {
      id: review.id,
      bookingId,
      propertyId: review.propertyId,
      rating: review.rating,
      comment: review.comment ?? null,
      createdAt: review.createdAt,
      authorName: review.user?.name ?? null,
      propertyName: review.property?.name,
      propertySlug: review.property?.slug,
    };
  }

  // ─── CREATE ───────────────────────────────────────────────────────────────

  /**
   * Клієнт залишає відгук після завершення поїздки.
   * Guard ReviewEligibilityGuard гарантує:
   *   - booking.status === COMPLETED
   *   - booking.userId === currentUser.id
   *   - відгук ще не існує
   */
  async create(
    bookingId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    // Отримуємо propertyId через unit → property
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        unit: { select: { property: { select: { id: true } } } },
      },
    });

    if (!booking) throw new NotFoundException('Бронювання не знайдено');

    const propertyId = booking.unit.property.id;

    const review = await this.prisma.review.create({
      data: {
        rating: dto.rating,
        comment: dto.comment,
        userId: booking.userId,
        propertyId,
      },
      include: {
        user: { select: { name: true } },
        property: { select: { name: true, slug: true } },
      },
    });

    // Після кожного нового відгуку — перераховуємо рейтинг
    // та потенційно приховуємо об'єкт
    await this.recalculateAndGuardRating(propertyId);

    return this.formatReview(review, bookingId);
  }

  // ─── READ ─────────────────────────────────────────────────────────────────

  /** Всі відгуки для конкретного об'єкта (публічний доступ) */
  async findByProperty(propertyId: string): Promise<ReviewResponseDto[]> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) throw new NotFoundException("Об'єкт не знайдено");

    const reviews = await this.prisma.review.findMany({
      where: { propertyId },
      include: {
        user: { select: { name: true } },
        property: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reviews.map((r) => this.formatReview(r));
  }

  /** Агрегований рейтинг об'єкта (окремий ендпоінт для швидкого запиту) */
  async getRating(propertyId: string): Promise<PropertyRatingDto> {
    const result = await this.prisma.review.aggregate({
      where: { propertyId },
      _avg: { rating: true },
      _count: { id: true },
    });

    return {
      rating: result._avg.rating
        ? Math.round(result._avg.rating * 10) / 10
        : null,
      reviewCount: result._count.id,
    };
  }

  /** Відгук для конкретного бронювання (клієнт перевіряє чи вже залишив) */
  async findByBooking(bookingId: string): Promise<ReviewResponseDto | null> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { unit: { select: { propertyId: true } } },
    });

    if (!booking) return null;

    const review = await this.prisma.review.findFirst({
      where: {
        userId: booking.userId,
        propertyId: booking.unit.propertyId,
      },
      include: {
        user: { select: { name: true } },
        property: { select: { name: true, slug: true } },
      },
    });

    return review ? this.formatReview(review, bookingId) : null;
  }

  // ─── Rating guard logic ───────────────────────────────────────────────────

  /**
   * Перераховує середній рейтинг після нового відгуку.
   * Якщо рейтинг падає нижче RATING_HIDE_THRESHOLD — приховує об'єкт.
   * Якщо рейтинг знову піднявся — повертає у видиму зону.
   */
  private async recalculateAndGuardRating(propertyId: string): Promise<void> {
    const result = await this.prisma.review.aggregate({
      where: { propertyId },
      _avg: { rating: true },
      _count: { id: true },
    });

    const avg = result._avg.rating ?? 0;
    const count = result._count.id;

    // Застосовуємо поріг лише якщо вистачає відгуків
    if (count < RATING_MIN_REVIEWS) return;

    const shouldHide = avg < RATING_HIDE_THRESHOLD;

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { status: true, name: true },
    });

    if (!property) return;

    // Змінюємо isActive лише якщо стан відрізняється від поточного
    if (shouldHide && property.status === PropertyStatus.ACTIVE) {
      await this.prisma.property.update({
        where: { id: propertyId },
        data: { status: PropertyStatus.BLOCKED },
      });
      this.logger.warn(
        `Об'єкт "${property.name}" (${propertyId}) приховано з пошуку. ` +
          `Середній рейтинг: ${avg.toFixed(1)} (поріг: ${RATING_HIDE_THRESHOLD})`,
      );
    } else if (!shouldHide && property.status === PropertyStatus.BLOCKED) {
      await this.prisma.property.update({
        where: { id: propertyId },
        data: { status: PropertyStatus.ACTIVE },
      });
      this.logger.log(
        `Об'єкт "${property.name}" (${propertyId}) відновлено у пошуку. ` +
          `Середній рейтинг: ${avg.toFixed(1)}`,
      );
    }
  }
}
