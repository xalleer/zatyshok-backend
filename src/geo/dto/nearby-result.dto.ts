import { ApiProperty } from '@nestjs/swagger';
import { PropertyResponseDto } from '../../property/dto/property-response.dto';

export class NearbyPropertyDto extends PropertyResponseDto {
  @ApiProperty({
    example: 4.7,
    description: 'Відстань до об\'єкта в кілометрах (округлено до 1 знаку)',
  })
  distanceKm: number;
}
