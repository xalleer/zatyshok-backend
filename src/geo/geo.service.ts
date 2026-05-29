import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NearbyQueryDto } from './dto/nearby-query.dto';
import { NearbyPropertyDto } from './dto/nearby-result.dto';
import { DEFAULT_RADIUS_KM } from './geo.constants';

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);

  constructor(private prisma: PrismaService) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private parseLocation(raw: unknown): { latitude: number; longitude: number } | null {
    if (!raw || typeof raw !== 'string') return null;
    const match = raw.match(/POINT\(([+-]?\d+\.?\d*)\s([+-]?\d+\.?\d*)\)/);
    if (!match) return null;
    return { longitude: parseFloat(match[1]), latitude: parseFloat(match[2]) };
  }

  private formatRow(row: any): NearbyPropertyDto {
    const coords = this.parseLocation(row.location);
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description ?? null,
      coverImage: row.coverImage ?? null,
      images: row.images ?? [],
      city: row.city ?? null,
      address: row.address ?? null,
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
      policy: row.policy,
      isActive: row.isActive,
      hostId: row.hostId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      rating: row.rating ? parseFloat(row.rating) : null,
      reviewCount: parseInt(row.reviewCount ?? '0'),
      // Відстань від запитуваної точки, округлена до 0.1 км
      distanceKm: Math.round(parseFloat(row.distance_m) / 100) / 10,
    };
  }

  // ─── Nearby search ────────────────────────────────────────────────────────

  /**
   * Основний ендпоінт "Недалеко від мене".
   *
   * Використовує PostGIS ST_DWithin для пошуку в радіусі
   * та ST_Distance для сортування від найближчого до найдальшого.
   *
   * Geography (SRID 4326) — відстань у метрах по поверхні Землі,
   * точніше за просту геометрію на великих відстанях.
   */
  async findNearby(query: NearbyQueryDto): Promise<NearbyPropertyDto[]> {
    const { lat, lng, radius = DEFAULT_RADIUS_KM, limit = 20 } = query;
    const radiusMeters = radius * 1000;

    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        p.*,
        ST_AsText(p.location)                                       AS location,
        ST_Distance(
          p.location::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        )                                                           AS distance_m,
        ROUND(AVG(r.rating)::numeric, 1)                           AS rating,
        COUNT(r.id)::int                                           AS "reviewCount"
      FROM "Property" p
      LEFT JOIN "Review" r ON r."propertyId" = p.id
      WHERE
        p."isActive" = true
        AND p.location IS NOT NULL
        AND ST_DWithin(
          p.location::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
      GROUP BY p.id
      ORDER BY distance_m ASC
      LIMIT ${limit}
    `;

    this.logger.debug(
      `Nearby search: lat=${lat}, lng=${lng}, radius=${radius}km → ${rows.length} результатів`,
    );

    return rows.map((row) => this.formatRow(row));
  }

  // ─── Map pins ─────────────────────────────────────────────────────────────

  /**
   * Легкий ендпоінт для відображення пінів на карті маркетплейсу.
   * Повертає лише мінімальні дані — id, slug, координати, ціна.
   * Без важких JOIN-ів — карта рендериться миттєво.
   *
   * Опціонально приймає bbox (bounding box) — відображає
   * лише те що зараз видно на екрані.
   */
  async getMapPins(bbox?: {
    swLat: number;
    swLng: number;
    neLat: number;
    neLng: number;
  }): Promise<MapPinDto[]> {
    let rows: any[];

    if (bbox) {
      // Фільтруємо по bounding box поточного вигляду карти
      rows = await this.prisma.$queryRaw<any[]>`
        SELECT
          p.id,
          p.slug,
          p.name,
          p."coverImage",
          ST_Y(p.location::geometry) AS latitude,
          ST_X(p.location::geometry) AS longitude,
          MIN(u.price)               AS min_price
        FROM "Property" p
        LEFT JOIN "Unit" u ON u."propertyId" = p.id
        WHERE
          p."isActive" = true
          AND p.location IS NOT NULL
          AND ST_Within(
            p.location::geometry,
            ST_MakeEnvelope(${bbox.swLng}, ${bbox.swLat}, ${bbox.neLng}, ${bbox.neLat}, 4326)
          )
        GROUP BY p.id
        ORDER BY p."created_at" DESC
      `;
    } else {
      // Всі активні об'єкти (для першого рендеру карти)
      rows = await this.prisma.$queryRaw<any[]>`
        SELECT
          p.id,
          p.slug,
          p.name,
          p."coverImage",
          ST_Y(p.location::geometry) AS latitude,
          ST_X(p.location::geometry) AS longitude,
          MIN(u.price)               AS min_price
        FROM "Property" p
        LEFT JOIN "Unit" u ON u."propertyId" = p.id
        WHERE
          p."isActive" = true
          AND p.location IS NOT NULL
        GROUP BY p.id
      `;
    }

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      coverImage: row.coverImage ?? null,
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      minPricePerNight: row.min_price ? parseInt(row.min_price) : null,
    }));
  }
}

// ─── Map pin DTO (inline — lightweight, not worth a separate file) ─────────

export interface MapPinDto {
  id: string;
  slug: string;
  name: string;
  coverImage: string | null;
  latitude: number;
  longitude: number;
  /** Мінімальна ціна юніта у копійках */
  minPricePerNight: number | null;
}
