import { IsOptional, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmBookingDto {
  @ApiPropertyOptional({
    example: 50000,
    description: 'Розмір передоплати у копійках (якщо потрібна). 0 = без передоплати.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  prepaymentAmount?: number;
}
