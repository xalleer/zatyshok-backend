import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { GeoService } from './geo.service';
import { NearbyQueryDto } from './dto/nearby-query.dto';
import { NearbyPropertyDto } from './dto/nearby-result.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('geo')
@Controller('geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  /**
   * GET /geo/nearby?lat=49.58&lng=34.55&radius=20&limit=20
   *
   * Killer-фіча маркетплейсу — "Недалеко від мене".
   * Фронт запитує геолокацію браузера і передає сюди.
   * Повертає об'єкти відсортовані від найближчого до найдальшого
   * з полем distanceKm для відображення "4.7 км від вас".
   */
  @Get('nearby')
  @Public()
  @ApiOperation({
    summary: 'Об\'єкти поблизу (killer-фіча "Недалеко від мене")',
    description:
      'PostGIS-пошук у радіусі. Результати відсортовані від найближчого до найдальшого.',
  })
  @ApiResponse({ status: 200, type: [NearbyPropertyDto] })
  findNearby(@Query() query: NearbyQueryDto): Promise<NearbyPropertyDto[]> {
    return this.geoService.findNearby(query);
  }

  /**
   * GET /geo/pins?swLat=&swLng=&neLat=&neLng=
   *
   * Піни для інтерактивної карти.
   * Легкий ендпоінт — повертає лише координати + мін. ціну.
   * Фронт (Leaflet) кластеризує їх самостійно.
   * Якщо bbox не передано — повертає всі активні об'єкти.
   */
  @Get('pins')
  @Public()
  @ApiOperation({
    summary: 'Піни для карти маркетплейсу',
    description:
      'Мінімальні дані для відображення маркерів на карті. Приймає bbox поточного вигляду.',
  })
  @ApiQuery({
    name: 'swLat',
    required: false,
    type: Number,
    description: 'Кут SW (широта)',
  })
  @ApiQuery({
    name: 'swLng',
    required: false,
    type: Number,
    description: 'Кут SW (довгота)',
  })
  @ApiQuery({
    name: 'neLat',
    required: false,
    type: Number,
    description: 'Кут NE (широта)',
  })
  @ApiQuery({
    name: 'neLng',
    required: false,
    type: Number,
    description: 'Кут NE (довгота)',
  })
  @ApiResponse({
    status: 200,
    description: 'Масив пінів з координатами і мін. ціною',
  })
  getMapPins(
    @Query('swLat') swLat?: string,
    @Query('swLng') swLng?: string,
    @Query('neLat') neLat?: string,
    @Query('neLng') neLng?: string,
  ) {
    const hasBbox = swLat && swLng && neLat && neLng;

    return this.geoService.getMapPins(
      hasBbox
        ? {
            swLat: parseFloat(swLat),
            swLng: parseFloat(swLng),
            neLat: parseFloat(neLat),
            neLng: parseFloat(neLng),
          }
        : undefined,
    );
  }
}
