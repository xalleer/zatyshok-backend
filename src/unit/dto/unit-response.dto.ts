import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UnitResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty({ description: 'Ціна за ніч у копійках' }) price: number;
  @ApiProperty() capacity: number;
  @ApiProperty() images: string[];
  @ApiProperty() features: string[];
  @ApiProperty() propertyId: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

/**
 * Зайнятий діапазон дат для юніта.
 * Використовується фронтом для відображення в календарі.
 */
export class OccupiedRangeDto {
  @ApiProperty({ example: '2025-06-15' }) checkIn: string;
  @ApiProperty({ example: '2025-06-17' }) checkOut: string;
  @ApiProperty({ example: 'CONFIRMED' }) status: string;
}

export class UnitWithAvailabilityDto extends UnitResponseDto {
  @ApiProperty({ type: [OccupiedRangeDto] })
  occupiedRanges: OccupiedRangeDto[];
}
