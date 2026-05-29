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

  @ApiPropertyOptional({ example: 'Ідеально для романтичного вікенду на двох.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    example: 250000,
    description: 'Ціна за ніч у копійках (2500 грн = 250000)',
  })
  @IsInt()
  @Min(0)
  price: number;

  @ApiProperty({ example: 2, description: 'Кількість гостей' })
  @IsInt()
  @Min(1)
  @Max(50)
  capacity: number;

  @ApiPropertyOptional({
    example: ['WiFi', 'Чан', 'Камін'],
    description: 'Список зручностей/фіч',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  features?: string[];
}
