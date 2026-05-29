import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class CreateBookingDto {
  @ApiProperty({ example: 'unit-uuid-here', description: 'ID юніта для бронювання' })
  @IsString()
  @IsNotEmpty()
  unitId: string;

  @ApiProperty({
    example: '2025-07-10',
    description: 'Дата заїзду (YYYY-MM-DD)',
  })
  @IsDateString()
  checkIn: string;

  @ApiProperty({
    example: '2025-07-13',
    description: 'Дата виїзду (YYYY-MM-DD)',
  })
  @IsDateString()
  checkOut: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    default: PaymentMethod.ONLINE,
    description: 'Спосіб оплати: онлайн або готівка на місці',
  })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: 'Будемо з собакою, можна?' })
  @IsOptional()
  @IsString()
  comment?: string;
}
