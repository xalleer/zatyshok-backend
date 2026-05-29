import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { UnitService } from '../unit/unit.service';
import Redis from 'ioredis';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ConfirmBookingDto } from './dto/confirm-booking.dto';
import { BookingResponseDto } from './dto/booking-response.dto';
import { BookingStatus, CancellationPolicy, PaymentMethod } from '@prisma/client';
import { format, differenceInDays, addHours } from 'date-fns';
import {
  HOLD_TTL_SECONDS,
  HOLD_REDIS_PREFIX,
  HOLD_CLEANUP_CRON,
  MS_PER_DAY,
} from './booking.constants';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private prisma: PrismaService,
    private unitService: UnitService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private holdKey(bookingId: string): string {
    return `${HOLD_REDIS_PREFIX}${bookingId}`;
  }

  private formatBooking(booking: any, holdExpiresIn?: number | null): BookingResponseDto {
    const checkIn = new Date(booking.checkIn);
    const checkOut = new Date(booking.checkOut);
    const nights = Math.max(1, differenceInDays(checkOut, checkIn));

    return {
      id: booking.id,
      unitId: booking.unitId,
      userId: booking.userId,
      checkIn: format(checkIn, 'yyyy-MM-dd'),
      checkOut: format(checkOut, 'yyyy-MM-dd'),
      nights,
      status: booking.status,
      paymentMethod: booking.paymentMethod,
      totalPrice: booking.totalPrice,
      prepaymentAmount: booking.prepaymentAmount ?? null,
      comment: booking.comment ?? null,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      // Вкладені поля з join-ів
      unitName: booking.unit?.name,
      propertyName: booking.unit?.property?.name,
      propertySlug: booking.unit?.property?.slug,
      holdExpiresIn: holdExpiresIn ?? null,
    };
  }

  // ─── Розрахунок суми ──────────────────────────────────────────────────────

  private calculateTotal(pricePerNight: number, checkIn: Date, checkOut: Date): number {
    const nights = Math.max(1, differenceInDays(checkOut, checkIn));
    return pricePerNight * nights;
  }

  // ─── Перевірка політики скасування ───────────────────────────────────────

  /**
   * Визначає чи можна повернути передоплату при скасуванні.
   *
   * FLEXIBLE: безкоштовне скасування за 48 год до заїзду.
   * STRICT: безкоштовне скасування лише 24 год після бронювання (якщо до заїзду > 7 днів).
   */
  private canRefund(
    policy: CancellationPolicy,
    checkIn: Date,
    bookingCreatedAt: Date,
    now = new Date(),
  ): boolean {
    const hoursToCheckIn = (checkIn.getTime() - now.getTime()) / (1000 * 60 * 60);
    const hoursSinceBooking = (now.getTime() - bookingCreatedAt.getTime()) / (1000 * 60 * 60);
    const daysToCheckIn = hoursToCheckIn / 24;

    if (policy === CancellationPolicy.FLEXIBLE) {
      // Безкоштовно якщо більше 48 год до заїзду
      return hoursToCheckIn >= 48;
    }

    if (policy === CancellationPolicy.STRICT) {
      // Безкоштовно якщо: в перші 24 год після бронювання І до заїзду > 7 днів
      return hoursSinceBooking <= 24 && daysToCheckIn > 7;
    }

    return false;
  }

  // ─── HOLD механізм ────────────────────────────────────────────────────────

  /**
   * Встановлює HOLD в Redis з TTL.
   * Якщо клієнт закрив вкладку — cron очистить через 15 хв.
   */
  private async setHold(bookingId: string): Promise<void> {
    await this.redis.set(this.holdKey(bookingId), '1', 'EX', HOLD_TTL_SECONDS);
  }

  private async getHoldTtl(bookingId: string): Promise<number | null> {
    const ttl = await this.redis.ttl(this.holdKey(bookingId));
    return ttl > 0 ? ttl : null;
  }

  private async releaseHold(bookingId: string): Promise<void> {
    await this.redis.del(this.holdKey(bookingId));
  }

  // ─── Cron: очищення протермінованих HOLD ──────────────────────────────────

  /**
   * Кожні 5 хвилин шукає бронювання зі статусом HOLD,
   * для яких Redis-ключ вже не існує (TTL вийшов або клієнт закрив вкладку).
   * Такі броні скасовуються — дати повертаються у вільний доступ.
   */
  @Cron(HOLD_CLEANUP_CRON)
  async cleanupExpiredHolds(): Promise<void> {
    const holdBookings = await this.prisma.booking.findMany({
      where: { status: BookingStatus.HOLD },
      select: { id: true, createdAt: true },
    });

    if (!holdBookings.length) return;

    const expiredIds: string[] = [];

    for (const booking of holdBookings) {
      const ttl = await this.redis.ttl(this.holdKey(booking.id));

      // ttl = -2: ключ не існує (протермінований або не був встановлений)
      // ttl = -1: ключ без TTL (не має бути, але перевіряємо)
      if (ttl < 0) {
        expiredIds.push(booking.id);
      }
    }

    if (expiredIds.length) {
      await this.prisma.booking.updateMany({
        where: { id: { in: expiredIds }, status: BookingStatus.HOLD },
        data: { status: BookingStatus.CANCELLED },
      });

      this.logger.log(`HOLD cleanup: скасовано ${expiredIds.length} бронювань: ${expiredIds.join(', ')}`);
    }
  }

  // ─── CREATE: Instant booking зі статусом HOLD ────────────────────────────

  async create(userId: string, dto: CreateBookingDto): Promise<BookingResponseDto> {
    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);

    // Базова валідація дат
    if (checkIn >= checkOut) {
      throw new BadRequestException('checkOut має бути пізніше checkIn');
    }
    if (checkIn < new Date()) {
      throw new BadRequestException('checkIn не може бути в минулому');
    }

    // Отримуємо юніт з ціною та інфо про property
    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId },
      include: { property: { select: { id: true, isActive: true } } },
    });

    if (!unit) throw new NotFoundException('Юніт не знайдено');
    if (!unit.property.isActive) {
      throw new BadRequestException('Цей об\'єкт наразі недоступний для бронювання');
    }

    // Перевірка доступності через UnitService
    const isAvailable = await this.unitService.checkAvailability(
      dto.unitId,
      checkIn,
      checkOut,
    );

    if (!isAvailable) {
      throw new ConflictException(
        'Обраний юніт вже заброньований на ці дати. Оберіть інші дати.',
      );
    }

    const totalPrice = this.calculateTotal(unit.price, checkIn, checkOut);

    // Створюємо бронювання зі статусом HOLD
    const booking = await this.prisma.booking.create({
      data: {
        userId,
        unitId: dto.unitId,
        checkIn,
        checkOut,
        status: BookingStatus.HOLD,
        totalPrice,
        paymentMethod: dto.paymentMethod ?? PaymentMethod.ONLINE,
        comment: dto.comment,
      },
      include: {
        unit: { include: { property: { select: { name: true, slug: true } } } },
      },
    });

    // Встановлюємо HOLD в Redis на 15 хвилин
    await this.setHold(booking.id);

    const holdTtl = await this.getHoldTtl(booking.id);
    return this.formatBooking(booking, holdTtl);
  }

  // ─── CONFIRM: HOST підтверджує бронювання ────────────────────────────────

  async confirm(bookingId: string, dto: ConfirmBookingDto): Promise<BookingResponseDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        unit: { include: { property: { select: { name: true, slug: true } } } },
      },
    });

    if (!booking) throw new NotFoundException('Бронювання не знайдено');

    if (booking.status !== BookingStatus.HOLD && booking.status !== BookingStatus.PENDING) {
      throw new BadRequestException(
        `Неможливо підтвердити бронювання зі статусом ${booking.status}`,
      );
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CONFIRMED,
        ...(dto.prepaymentAmount !== undefined && {
          prepaymentAmount: dto.prepaymentAmount,
        }),
      },
      include: {
        unit: { include: { property: { select: { name: true, slug: true } } } },
      },
    });

    // Знімаємо HOLD з Redis (він більше не потрібен)
    await this.releaseHold(bookingId);

    return this.formatBooking(updated);
  }

  // ─── CANCEL: Скасування клієнтом або хостом ──────────────────────────────

  async cancel(bookingId: string, cancelledBy: 'CLIENT' | 'HOST' | 'ADMIN'): Promise<BookingResponseDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        unit: {
          include: {
            property: {
              select: { name: true, slug: true, policy: true },
            },
          },
        },
      },
    });

    if (!booking) throw new NotFoundException('Бронювання не знайдено');

    const cancellableStatuses: BookingStatus[] = [
      BookingStatus.HOLD,
      BookingStatus.PENDING,
      BookingStatus.CONFIRMED,
    ];

    if (!cancellableStatuses.includes(booking.status)) {
      throw new BadRequestException(
        `Неможливо скасувати бронювання зі статусом ${booking.status}`,
      );
    }

    // Визначаємо можливість повернення передоплати
    const policy = booking.unit.property.policy;
    const refundable = cancelledBy !== 'HOST' && this.canRefund(
      policy,
      booking.checkIn,
      booking.createdAt,
    );

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CANCELLED },
      include: {
        unit: { include: { property: { select: { name: true, slug: true } } } },
      },
    });

    // Очищаємо HOLD якщо був
    await this.releaseHold(bookingId);

    this.logger.log(
      `Бронювання ${bookingId} скасовано. Ініціатор: ${cancelledBy}. Повернення: ${refundable ? 'ТАК' : 'НІ'}`,
    );

    // TODO: якщо refundable && booking.transaction → ініціювати refund через payment gateway

    return this.formatBooking(updated);
  }

  // ─── COMPLETE: Позначення як завершеного (HOST/ADMIN/Cron) ───────────────

  async complete(bookingId: string): Promise<BookingResponseDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        unit: { include: { property: { select: { name: true, slug: true } } } },
      },
    });

    if (!booking) throw new NotFoundException('Бронювання не знайдено');

    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(
        `Тільки CONFIRMED бронювання можна позначити як COMPLETED`,
      );
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.COMPLETED },
      include: {
        unit: { include: { property: { select: { name: true, slug: true } } } },
      },
    });

    return this.formatBooking(updated);
  }

  // ─── READ ─────────────────────────────────────────────────────────────────

  async findById(bookingId: string): Promise<BookingResponseDto> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        unit: { include: { property: { select: { name: true, slug: true } } } },
      },
    });

    if (!booking) throw new NotFoundException('Бронювання не знайдено');

    const holdTtl = booking.status === BookingStatus.HOLD
      ? await this.getHoldTtl(bookingId)
      : null;

    return this.formatBooking(booking, holdTtl);
  }

  /** Всі бронювання поточного клієнта */
  async findByUser(userId: string): Promise<BookingResponseDto[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { userId },
      include: {
        unit: { include: { property: { select: { name: true, slug: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      bookings.map(async (b) => {
        const holdTtl = b.status === BookingStatus.HOLD
          ? await this.getHoldTtl(b.id)
          : null;
        return this.formatBooking(b, holdTtl);
      }),
    );
  }

  /** Всі бронювання по юнітах конкретної Property (для HOST-дашборду) */
  async findByProperty(propertyId: string): Promise<BookingResponseDto[]> {
    const bookings = await this.prisma.booking.findMany({
      where: {
        unit: { propertyId },
      },
      include: {
        unit: { include: { property: { select: { name: true, slug: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      bookings.map(async (b) => {
        const holdTtl = b.status === BookingStatus.HOLD
          ? await this.getHoldTtl(b.id)
          : null;
        return this.formatBooking(b, holdTtl);
      }),
    );
  }

  /** Ручне блокування дат власником (наприклад: дзвінок по телефону) */
  async blockDates(
    hostId: string,
    dto: CreateBookingDto & { unitId: string },
  ): Promise<BookingResponseDto> {
    // Перевіряємо що HOST дійсно є власником цього юніта
    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId },
      include: { property: { select: { hostId: true, name: true, slug: true } } },
    });

    if (!unit) throw new NotFoundException('Юніт не знайдено');
    if (unit.property.hostId !== hostId) {
      throw new ForbiddenException('Ви не є власником цього юніта');
    }

    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);

    if (checkIn >= checkOut) {
      throw new BadRequestException('checkOut має бути пізніше checkIn');
    }

    const isAvailable = await this.unitService.checkAvailability(dto.unitId, checkIn, checkOut);
    if (!isAvailable) {
      throw new ConflictException('Ці дати вже заброньовані');
    }

    // Створюємо одразу CONFIRMED — без HOLD, без клієнта
    const booking = await this.prisma.booking.create({
      data: {
        userId: hostId, // технічно власник "бронює" сам
        unitId: dto.unitId,
        checkIn,
        checkOut,
        status: BookingStatus.CONFIRMED,
        totalPrice: 0,
        paymentMethod: PaymentMethod.CASH,
        comment: dto.comment ?? 'Заблоковано власником',
      },
      include: {
        unit: { include: { property: { select: { name: true, slug: true } } } },
      },
    });

    return this.formatBooking(booking);
  }
}
