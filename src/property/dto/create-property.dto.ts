import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CancellationPolicy } from '../../../prisma/generated/enums';

export class CreatePropertyDto {
  @ApiProperty({ example: 'Глемпінг "Лісова Пісня"' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({
    example: 'lisova-pisnya',
    description: 'URL slug — лише літери, цифри та дефіс',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug може містити лише малі латинські літери, цифри та дефіс',
  })
  @MaxLength(60)
  slug: string;

  @ApiPropertyOptional({ example: 'Затишні куполи в сосновому лісі.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'Полтава' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'вул. Соснова, 1' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @ApiPropertyOptional({
    example: 49.5883,
    description: 'Широта (latitude). Якщо не вказано — геокодується з address',
  })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 34.5514, description: 'Довгота (longitude)' })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({
    enum: CancellationPolicy,
    default: CancellationPolicy.FLEXIBLE,
  })
  @IsOptional()
  @IsEnum(CancellationPolicy)
  policy?: CancellationPolicy;
}
