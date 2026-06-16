import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
  ArrayMaxSize,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUnitDto {
  @ApiProperty({ example: 'Купол "Світанок"' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty({ example: 250000 })
  @IsInt()
  @Min(0)
  price: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  @Max(50)
  capacity: number;

  @ApiPropertyOptional({
    example: ['slug-wifi', 'slug-chan'],
    description: 'Масив slug зручностей з таблиці Feature',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  featureSlugs?: string[];
}
