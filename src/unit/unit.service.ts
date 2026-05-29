import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import {
  UnitResponseDto,
  UnitWithAvailabilityDto,
  OccupiedRangeDto,
} from './dto/unit-response.dto';
import { format } from 'date-fns';

// Статуси, що блокують дати в календарі
const BLOCKING_STATUSES = ['HOLD', 'CONFIRMED', 'PENDING'];

@Injectable()
export class UnitService {
  constructor(private prisma: PrismaService) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private formatUnit(unit: any): UnitResponseDto {
    return {
      id: unit.id,
      name: unit.name,
      description: unit.description ?? null,
      price: unit.price,
      capacity: unit.capacity,
      images: unit.images ?? [],
      features: unit.features ?? [],
      propertyId: unit.propertyId,
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
    };
  }

  // ─── Verify property ownership ────────────────────────────────────────────

  /**
   * Перевіряє що property існує і належить hostId.
   * Кидає виняток якщо ні — використовується перед create.
   */
  private async verifyPropertyOwnership(
    propertyId: string,
    hostId: string,
  ): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { hostId: true },
    });

    if (!property) {
      throw new NotFoundException(`Property з id "${propertyId}" не знайдено`);
    }

    if (property.hostId !== hostId) {
      throw new ForbiddenException(
        'Ви не є власником цієї бази відпочинку',
      );
    }
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(
    propertyId: string,
    hostId: string,
    dto: CreateUnitDto,
  ): Promise<UnitResponseDto> {
    await this.verifyPropertyOwnership(propertyId, hostId);

    const unit = await this.prisma.unit.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        capacity: dto.capacity,
        features: dto.features ?? [],
        propertyId,
      },
    });

    return this.formatUnit(unit);
  }

  /**
   * Всі юніти конкретної Property (публічний доступ).
   * Включає зайняті діапазони дат для побудови календаря.
   */
  async findByProperty(propertyId: string): Promise<UnitWithAvailabilityDto[]> {
    // Перевіряємо що property існує
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });
    if (!property) {
      throw new NotFoundException(`Property з id "${propertyId}" не знайдено`);
    }

    const units = await this.prisma.unit.findMany({
      where: { propertyId },
      include: {
        bookings: {
          where: {
            status: { in: BLOCKING_STATUSES as any },
            // Тільки майбутні та поточні броні
            checkOut: { gte: new Date() },
          },
          select: {
            checkIn: true,
            checkOut: true,
            status: true,
          },
          orderBy: { checkIn: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return units.map((unit) => ({
      ...this.formatUnit(unit),
      occupiedRanges: unit.bookings.map(
        (b): OccupiedRangeDto => ({
          checkIn: format(b.checkIn, 'yyyy-MM-dd'),
          checkOut: format(b.checkOut, 'yyyy-MM-dd'),
          status: b.status,
        }),
      ),
    }));
  }

  /**
   * Один юніт з повною доступністю — для сторінки вибору дат.
   */
  async findOne(unitId: string): Promise<UnitWithAvailabilityDto> {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      include: {
        bookings: {
          where: {
            status: { in: BLOCKING_STATUSES as any },
            checkOut: { gte: new Date() },
          },
          select: { checkIn: true, checkOut: true, status: true },
          orderBy: { checkIn: 'asc' },
        },
      },
    });

    if (!unit) {
      throw new NotFoundException(`Юніт з id "${unitId}" не знайдено`);
    }

    return {
      ...this.formatUnit(unit),
      occupiedRanges: unit.bookings.map(
        (b): OccupiedRangeDto => ({
          checkIn: format(b.checkIn, 'yyyy-MM-dd'),
          checkOut: format(b.checkOut, 'yyyy-MM-dd'),
          status: b.status,
        }),
      ),
    };
  }

  async update(unitId: string, dto: UpdateUnitDto): Promise<UnitResponseDto> {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Юніт не знайдено');

    const updated = await this.prisma.unit.update({
      where: { id: unitId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.features !== undefined && { features: dto.features }),
      },
    });

    return this.formatUnit(updated);
  }

  async remove(unitId: string): Promise<{ message: string }> {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Юніт не знайдено');

    // Перевірка активних бронювань
    const activeBookings = await this.prisma.booking.count({
      where: {
        unitId,
        status: { in: ['HOLD', 'PENDING', 'CONFIRMED'] as any },
      },
    });

    if (activeBookings > 0) {
      throw new ForbiddenException(
        `Неможливо видалити юніт: є ${activeBookings} активних бронювань. Спочатку скасуйте їх.`,
      );
    }

    await this.prisma.unit.delete({ where: { id: unitId } });
    return { message: 'Юніт успішно видалено' };
  }

  // ─── Availability check ───────────────────────────────────────────────────

  /**
   * Перевірка чи вільний юніт у заданий діапазон дат.
   * Використовується в BookingService перед створенням броні.
   */
  async checkAvailability(
    unitId: string,
    checkIn: Date,
    checkOut: Date,
    excludeBookingId?: string,
  ): Promise<boolean> {
    const conflict = await this.prisma.booking.findFirst({
      where: {
        unitId,
        status: { in: BLOCKING_STATUSES as any },
        ...(excludeBookingId && { id: { not: excludeBookingId } }),
        // Перевірка перекриття діапазонів:
        // Бронювання конфліктує якщо checkIn < існуючий checkOut
        // І checkOut > існуючий checkIn
        AND: [
          { checkIn: { lt: checkOut } },
          { checkOut: { gt: checkIn } },
        ],
      },
    });

    return !conflict;
  }
}
