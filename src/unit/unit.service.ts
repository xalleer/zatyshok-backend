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

const BLOCKING_STATUSES = ['HOLD', 'CONFIRMED', 'PENDING'];

const UNIT_INCLUDE = {
  images: { orderBy: { sortOrder: 'asc' } },
  features: true,
  category: true,
} as const;

@Injectable()
export class UnitService {
  constructor(private prisma: PrismaService) {}

  private formatUnit(unit: any): UnitResponseDto {
    return {
      id: unit.id,
      name: unit.name,
      description: unit.description ?? null,
      price: unit.price,
      capacity: unit.capacity,
      status: unit.status,
      bookingType: unit.bookingType,
      images: unit.images ?? [],
      features: unit.features ?? [],
      propertyId: unit.propertyId,
      categoryId: unit.categoryId,
      createdAt: unit.createdAt,
      updatedAt: unit.updatedAt,
    };
  }

  private async verifyPropertyOwnership(propertyId: string, hostId: string): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { hostId: true },
    });
    if (!property) throw new NotFoundException(`Property "${propertyId}" не знайдено`);
    if (property.hostId !== hostId) throw new ForbiddenException('Ви не власник цієї бази');
  }

  async create(propertyId: string, hostId: string, dto: CreateUnitDto): Promise<UnitResponseDto> {
    await this.verifyPropertyOwnership(propertyId, hostId);

    const unit = await this.prisma.unit.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        capacity: dto.capacity,
        categoryId: dto.categoryId,
        propertyId,
        ...(dto.featureSlugs?.length && {
          features: {
            connect: dto.featureSlugs.map((slug) => ({ slug })),
          },
        }),
      },
      include: UNIT_INCLUDE,
    });

    return this.formatUnit(unit);
  }

  async findByProperty(propertyId: string): Promise<UnitWithAvailabilityDto[]> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });
    if (!property) throw new NotFoundException(`Property "${propertyId}" не знайдено`);

    const units = await this.prisma.unit.findMany({
      where: { propertyId },
      include: {
        ...UNIT_INCLUDE,
        bookings: {
          where: {
            status: { in: BLOCKING_STATUSES as any },
            checkOut: { gte: new Date() },
          },
          select: { checkIn: true, checkOut: true, status: true },
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

  async findOne(unitId: string): Promise<UnitWithAvailabilityDto> {
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      include: {
        ...UNIT_INCLUDE,
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
    if (!unit) throw new NotFoundException(`Юніт "${unitId}" не знайдено`);

    return {
      ...this.formatUnit(unit),
      occupiedRanges: unit.bookings.map((b): OccupiedRangeDto => ({
        checkIn: format(b.checkIn, 'yyyy-MM-dd'),
        checkOut: format(b.checkOut, 'yyyy-MM-dd'),
        status: b.status,
      })),
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
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.featureSlugs !== undefined && {
          features: { set: dto.featureSlugs.map((slug) => ({ slug })) },
        }),
      },
      include: UNIT_INCLUDE,
    });

    return this.formatUnit(updated);
  }

  async remove(unitId: string): Promise<{ message: string }> {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId } });
    if (!unit) throw new NotFoundException('Юніт не знайдено');

    const activeBookings = await this.prisma.booking.count({
      where: { unitId, status: { in: ['HOLD', 'PENDING', 'CONFIRMED'] as any } },
    });
    if (activeBookings > 0) {
      throw new ForbiddenException(`Є ${activeBookings} активних бронювань. Спочатку скасуйте їх.`);
    }

    await this.prisma.unit.delete({ where: { id: unitId } });
    return { message: 'Юніт успішно видалено' };
  }

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
        AND: [{ checkIn: { lt: checkOut } }, { checkOut: { gt: checkIn } }],
      },
    });
    return !conflict;
  }
}
