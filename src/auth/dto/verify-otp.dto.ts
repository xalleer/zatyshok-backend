import { IsString, IsNotEmpty, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({
    example: '+380501234567',
    description: 'Phone number in international format',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'Phone number must be a valid international format (e.g., +380501234567)',
  })
  phone: string;

  @ApiProperty({
    example: '1234',
    description: '4-digit OTP code',
  })
  @IsString()
  @IsNotEmpty()
  @Length(4, 4, { message: 'OTP code must be exactly 4 digits' })
  @Matches(/^[0-9]{4}$/, { message: 'OTP code must contain only digits' })
  code: string;
}
