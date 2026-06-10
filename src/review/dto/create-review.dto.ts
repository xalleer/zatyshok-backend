import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MIN_RATING, MAX_RATING } from '../review.constants';

export class CreateReviewDto {
  @ApiProperty({
    example: 5,
    description: `Рейтинг від ${MIN_RATING} до ${MAX_RATING}`,
    minimum: MIN_RATING,
    maximum: MAX_RATING,
  })
  @IsInt()
  @Min(MIN_RATING)
  @Max(MAX_RATING)
  rating: number;

  @ApiPropertyOptional({
    example: "Чудове місце, обов'язково повернемося!",
    description: "Текстовий коментар (необов'язковий)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
