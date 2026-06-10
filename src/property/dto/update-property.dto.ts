import { PartialType } from '@nestjs/swagger';
import { CreatePropertyDto } from './create-property.dto';
import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePropertyDto extends PartialType(CreatePropertyDto) {
  @ApiPropertyOptional({ description: "Активувати / деактивувати об'єкт" })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
