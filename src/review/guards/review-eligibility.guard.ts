import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Перевіряє право залишити відгук:
 * 1. Бронювання існує і його статус — COMPLETED.
 * 2. Бронювання належить поточному клієнту.
 * 3. Відгук для цього бронювання ще не існує.
 *
 * Бере :bookingId з params або body.
 */
@Injectable()
export class ReviewEligibilityGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const bookingId: string =
      request.params.bookingId ?? request.body?.bookingId;

    if (!bookingId) {
      throw new ForbiddenException('bookingId не вказано');
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { unit: { select: { propertyId: true } } },
    });

    if (!booking) {
      throw new NotFoundException('Бронювання не знайдено');
    }

    // Тільки власник броні може залишити відгук
    if (booking.userId !== user.id) {
      throw new ForbiddenException('Ви не є клієнтом цього бронювання');
    }

    // Лише після завершення поїздки
    if (booking.status !== 'COMPLETED') {
      throw new ForbiddenException(
        'Відгук можна залишити лише після завершення бронювання (статус COMPLETED)',
      );
    }

    // Захист від дублювання
    const existingReview = await this.prisma.review.findFirst({
      where: {
        userId: booking.userId,
        propertyId: booking.unit.propertyId,
      },
    });

    if (existingReview) {
      throw new ConflictException(
        'Ви вже залишили відгук для цього бронювання',
      );
    }

    return true;
  }
}
