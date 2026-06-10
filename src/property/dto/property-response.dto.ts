import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CancellationPolicy } from '../../../prisma/generated/enums';

export class PropertyResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiPropertyOptional() coverImage?: string | null;
  @ApiProperty() images: string[];
  @ApiPropertyOptional() city?: string | null;
  @ApiPropertyOptional() address?: string | null;
  @ApiPropertyOptional() latitude?: number | null;
  @ApiPropertyOptional() longitude?: number | null;
  @ApiProperty({ enum: CancellationPolicy }) policy: CancellationPolicy;
  @ApiProperty() isActive: boolean;
  @ApiProperty() hostId: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  // Агреговані поля з відгуків
  @ApiPropertyOptional({ description: 'Середній рейтинг (1–5)' })
  rating?: number | null;

  @ApiPropertyOptional({ description: 'Кількість відгуків' })
  reviewCount?: number;
}
