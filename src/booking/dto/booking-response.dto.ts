import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus, PaymentMethod } from '@prisma/client';

export class BookingResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() unitId: string;
  @ApiProperty() userId: string;

  @ApiProperty({ example: '2025-07-10' }) checkIn: string;
  @ApiProperty({ example: '2025-07-13' }) checkOut: string;
  @ApiProperty({ description: 'Кількість ночей' }) nights: number;

  @ApiProperty({ enum: BookingStatus }) status: BookingStatus;
  @ApiProperty({ enum: PaymentMethod }) paymentMethod: PaymentMethod;

  @ApiProperty({ description: 'Загальна сума у копійках' }) totalPrice: number;
  @ApiPropertyOptional({ description: 'Сума передоплати у копійках' }) prepaymentAmount?: number | null;

  @ApiPropertyOptional() comment?: string | null;

  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  // Вкладені дані для зручності фронту
  @ApiPropertyOptional() unitName?: string;
  @ApiPropertyOptional() propertyName?: string;
  @ApiPropertyOptional() propertySlug?: string;

  // Для HOLD: скільки секунд залишилось до скасування
  @ApiPropertyOptional({ description: 'Секунд до закінчення HOLD' })
  holdExpiresIn?: number | null;
}
