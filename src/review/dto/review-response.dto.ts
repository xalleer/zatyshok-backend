import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewResponseDto {
  @ApiProperty() id: string;
  @ApiPropertyOptional() bookingId?: string | null;
  @ApiProperty() propertyId: string;

  @ApiProperty({ example: 5, description: 'Рейтинг від 1 до 5' })
  rating: number;

  @ApiPropertyOptional({ example: 'Чудове місце!' })
  comment?: string | null;

  @ApiProperty() createdAt: Date;

  // Вкладені дані для відображення
  @ApiPropertyOptional({ description: "Ім'я клієнта (якщо не анонімний)" })
  authorName?: string | null;

  @ApiPropertyOptional({ description: "Назва об'єкта" })
  propertyName?: string;

  @ApiPropertyOptional({ description: "Slug об'єкта" })
  propertySlug?: string;
}

export class PropertyRatingDto {
  @ApiProperty({ description: 'Середній рейтинг' }) rating: number | null;
  @ApiProperty({ description: 'Кількість відгуків' }) reviewCount: number;
}
