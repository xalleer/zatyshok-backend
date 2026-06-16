import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FeatureDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
}

export class ImageDto {
  @ApiProperty() id: string;
  @ApiProperty() url: string;
  @ApiProperty() sortOrder: number;
}

export class UnitResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty() price: number;
  @ApiProperty() capacity: number;
  @ApiProperty() status: string;
  @ApiProperty() bookingType: string;
  @ApiProperty({ type: [ImageDto] }) images: ImageDto[];
  @ApiProperty({ type: [FeatureDto] }) features: FeatureDto[];
  @ApiProperty() propertyId: string;
  @ApiProperty() categoryId: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class OccupiedRangeDto {
  @ApiProperty() checkIn: string;
  @ApiProperty() checkOut: string;
  @ApiProperty() status: string;
}

export class UnitWithAvailabilityDto extends UnitResponseDto {
  @ApiProperty({ type: [OccupiedRangeDto] })
  occupiedRanges: OccupiedRangeDto[];
}
