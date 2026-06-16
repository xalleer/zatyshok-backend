import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CancellationPolicy, PropertyStatus } from '../../../prisma/generated/enums';
import { UnitResponseDto } from '../../unit/dto/unit-response.dto';

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
  @ApiProperty({ enum: PropertyStatus }) status: PropertyStatus;
  @ApiProperty() isActive: boolean;
  @ApiProperty() hostId: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ type: [UnitResponseDto] }) units: UnitResponseDto[];

  // Агреговані поля з відгуків
  @ApiPropertyOptional({ description: 'Середній рейтинг (1–5)' })
  rating?: number | null;

  @ApiPropertyOptional({ description: 'Кількість відгуків' })
  reviewCount?: number;
}
