import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyResponseDto } from './dto/property-response.dto';
import {
  PaginationDto,
  PaginatedResponseDto,
} from '../common/dto/pagination.dto';

@Injectable()
export class PropertyService {
  constructor(private prisma: PrismaService) {}

  private async geocodeAddress(
    address: string,
    city?: string,
  ): Promise<{ lat: number; lon: number } | null> {
    const query = [address, city, 'Ukraine'].filter(Boolean).join(', ');
    const encoded = encodeURIComponent(query);
    const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Zatyshok/1.0 (contact@zatyshok.com)',
        },
      });

      if (!res.ok) return null;

      const data = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (!data.length) return null;

      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    } catch {
      return null;
    }
  }

  private parseLocation(
    raw: unknown,
  ): { latitude: number; longitude: number } | null {
    if (!raw || typeof raw !== 'string') return null;
    const match = raw.match(/POINT\(([+-]?\d+\.?\d*)\s([+-]?\d+\.?\d*)\)/);
    if (!match) return null;
    return { longitude: parseFloat(match[1]), latitude: parseFloat(match[2]) };
  }

// В formatProperty додаємо units:
  private formatProperty(property: any, aggregates?: { rating: number | null; reviewCount: number }): PropertyResponseDto {
    const coords = this.parseLocation(property.location);
    return {
      id: property.id,
      name: property.name,
      slug: property.slug,
      description: property.description,
      images: property.images ?? [],       // тепер Image[]
      city: property.city,
      address: property.address,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      policy: property.policy,
      hostId: property.hostId,
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
      units: property.units?.map((u: any) => ({
        id: u.id,
        name: u.name,
        description: u.description ?? null,
        price: u.price,
        capacity: u.capacity,
        status: u.status,
        bookingType: u.bookingType,
        images: u.images ?? [],
        features: u.features ?? [],
        propertyId: u.propertyId,
        categoryId: u.categoryId,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })) ?? [],
      rating: aggregates?.rating ?? null,
      reviewCount: aggregates?.reviewCount ?? 0,
    };
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async create(
    hostId: string,
    dto: CreatePropertyDto,
  ): Promise<PropertyResponseDto> {
    // Перевірка унікальності slug
    const existing = await this.prisma.property.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(
        `Slug "${dto.slug}" вже зайнятий. Оберіть інший.`,
      );
    }

    // Визначаємо координати
    let lat = dto.latitude;
    let lon = dto.longitude;

    if ((!lat || !lon) && dto.address) {
      const geo = await this.geocodeAddress(dto.address, dto.city);
      if (geo) {
        lat = geo.lat;
        lon = geo.lon;
      }
    }

    // Основний запис
    const property = await this.prisma.property.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        city: dto.city,
        address: dto.address,
        policy: dto.policy,
        hostId,
      },
    });

    // Окремо оновлюємо геометрію через raw SQL (Prisma не підтримує PostGIS-типи нативно)
    if (lat && lon) {
      await this.prisma.$executeRaw`
        UPDATE "Property"
        SET location = ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
        WHERE id = ${property.id}
      `;
    }

    const fresh = await this.findRaw(property.id);
    return this.formatProperty(fresh);
  }

  async findAll(pagination: PaginationDto): Promise<PaginatedResponseDto<PropertyResponseDto>> {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const [total, properties] = await Promise.all([
      this.prisma.property.count({ where: { status: 'ACTIVE' } }),
      this.prisma.property.findMany({
        where: { status: 'ACTIVE' },
        include: {
          images: { orderBy: { sortOrder: 'asc' } },
          units: {
            include: {
              images: { orderBy: { sortOrder: 'asc' } },
              features: true,
            },
            orderBy: { createdAt: 'asc' },
          },
          reviews: { select: { rating: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const data = properties.map((p) => {
      const ratings = p.reviews.map((r) => r.rating);
      const avg = ratings.length
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
        : null;

      return this.formatProperty(
        { ...p, location: null }, // координати окремо якщо потрібні
        { rating: avg, reviewCount: ratings.length },
      );
    });

    const totalPages = Math.ceil(total / limit);
    return {
      data,
      meta: { total, page, limit, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 },
    };
  }

  async findBySlug(slug: string): Promise<PropertyResponseDto> {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        p.*,
        ST_AsText(p.location) as location,
        ROUND(AVG(r.rating)::numeric, 1) as rating,
        COUNT(r.id)::int as "reviewCount"
      FROM "Property" p
      LEFT JOIN "Review" r ON r."propertyId" = p.id
      WHERE p.slug = ${slug}
      GROUP BY p.id
      LIMIT 1
    `;

    if (!rows.length) {
      throw new NotFoundException(`Об'єкт зі slug "${slug}" не знайдено`);
    }

    const p = rows[0];
    return this.formatProperty(p, {
      rating: p.rating ? parseFloat(p.rating) : null,
      reviewCount: p.reviewCount ?? 0,
    });
  }

  async findById(id: string): Promise<PropertyResponseDto> {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        p.*,
        ST_AsText(p.location) as location,
        ROUND(AVG(r.rating)::numeric, 1) as rating,
        COUNT(r.id)::int as "reviewCount"
      FROM "Property" p
      LEFT JOIN "Review" r ON r."propertyId" = p.id
      WHERE p.id = ${id}
      GROUP BY p.id
      LIMIT 1
    `;

    if (!rows.length) {
      throw new NotFoundException(`Об'єкт з id "${id}" не знайдено`);
    }

    const p = rows[0];
    return this.formatProperty(p, {
      rating: p.rating ? parseFloat(p.rating) : null,
      reviewCount: p.reviewCount ?? 0,
    });
  }

  async update(
    id: string,
    dto: UpdatePropertyDto,
  ): Promise<PropertyResponseDto> {
    // Перевірка slug на унікальність (якщо змінюється)
    if (dto.slug) {
      const conflict = await this.prisma.property.findFirst({
        where: { slug: dto.slug, NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException(`Slug "${dto.slug}" вже зайнятий.`);
      }
    }

    // Оновлення скалярних полів
    await this.prisma.property.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.slug && { slug: dto.slug }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.policy && { policy: dto.policy }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    // Геоновлення якщо є нові координати або адреса
    let lat = dto.latitude;
    let lon = dto.longitude;

    if ((!lat || !lon) && dto.address) {
      const geo = await this.geocodeAddress(dto.address, dto.city);
      if (geo) {
        lat = geo.lat;
        lon = geo.lon;
      }
    }

    if (lat && lon) {
      await this.prisma.$executeRaw`
        UPDATE "Property"
        SET location = ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)
        WHERE id = ${id}
      `;
    }

    return this.findById(id);
  }

  async remove(id: string): Promise<{ message: string }> {
    const property = await this.prisma.property.findUnique({ where: { id } });
    if (!property) throw new NotFoundException("Об'єкт не знайдено");

    await this.prisma.property.delete({ where: { id } });
    return { message: "Об'єкт успішно видалено" };
  }

  async findByHost(
    hostId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<PropertyResponseDto>> {
    const { page = 1, limit = 10 } = pagination;
    const offset = (page - 1) * limit;

    // Отримуємо загальну кількість
    const countResult = await this.prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as total
      FROM "Property" p
      WHERE p."hostId" = ${hostId}
    `;
    const total = parseInt(countResult[0].total);

    const properties = await this.prisma.$queryRaw<any[]>`
      SELECT
        p.*,
        ST_AsText(p.location) as location,
        ROUND(AVG(r.rating)::numeric, 1) as rating,
        COUNT(r.id)::int as "reviewCount"
      FROM "Property" p
      LEFT JOIN "Review" r ON r."propertyId" = p.id
      WHERE p."hostId" = ${hostId}
      GROUP BY p.id
      ORDER BY p."created_at" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const data = properties.map((p) =>
      this.formatProperty(p, {
        rating: p.rating ? parseFloat(p.rating) : null,
        reviewCount: p.reviewCount ?? 0,
      }),
    );

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private async findRaw(id: string) {
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT *, ST_AsText(location) as location
      FROM "Property" WHERE id = ${id} LIMIT 1
    `;
    if (!rows.length) throw new NotFoundException("Об'єкт не знайдено");
    return rows[0];
  }
}
