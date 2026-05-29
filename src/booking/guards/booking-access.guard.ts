import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Перевіряє доступ до конкретного бронювання.
 * Дозволяє: клієнт-власник броні, HOST об'єкта, ADMIN.
 */
@Injectable()
export class BookingAccessGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const bookingId = request.params.id;

    if (user.role === 'ADMIN') return true;

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        userId: true,
        unit: { select: { property: { select: { hostId: true } } } },
      },
    });

    if (!booking) throw new NotFoundException('Бронювання не знайдено');

    const isClient = booking.userId === user.id;
    const isHost = booking.unit.property.hostId === user.id;

    if (!isClient && !isHost) {
      throw new ForbiddenException('Доступ до цього бронювання заборонено');
    }

    return true;
  }
}

/**
 * Тільки HOST об'єкта може підтверджувати/скасовувати броні з боку власника.
 */
@Injectable()
export class BookingHostGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const bookingId = request.params.id;

    if (user.role === 'ADMIN') return true;

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        unit: { select: { property: { select: { hostId: true } } } },
      },
    });

    if (!booking) throw new NotFoundException('Бронювання не знайдено');

    if (booking.unit.property.hostId !== user.id) {
      throw new ForbiddenException('Тільки власник бази може виконати цю дію');
    }

    return true;
  }
}
