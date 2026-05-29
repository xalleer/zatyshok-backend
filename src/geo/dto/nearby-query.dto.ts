import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
  DEFAULT_NEARBY_LIMIT,
  MAX_NEARBY_LIMIT,
} from '../geo.constants';

export class NearbyQueryDto {
  @ApiProperty({
    example: 49.5883,
    description: 'Широта (latitude) поточного місцезнаходження',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({
    example: 34.5514,
    description: 'Довгота (longitude) поточного місцезнаходження',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiPropertyOptional({
    example: DEFAULT_RADIUS_KM,
    description: `Радіус пошуку в кілометрах (макс. ${MAX_RADIUS_KM})`,
    default: DEFAULT_RADIUS_KM,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(MAX_RADIUS_KM)
  radius?: number = DEFAULT_RADIUS_KM;

  @ApiPropertyOptional({
    example: DEFAULT_NEARBY_LIMIT,
    description: 'Кількість результатів',
    default: DEFAULT_NEARBY_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(MAX_NEARBY_LIMIT)
  limit?: number = DEFAULT_NEARBY_LIMIT;
}
