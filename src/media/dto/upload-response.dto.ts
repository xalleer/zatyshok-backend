import { ApiProperty } from '@nestjs/swagger';

export class UploadedFileDto {
  @ApiProperty({ example: 'https://res.cloudinary.com/zatyshok/image/upload/v1/zatyshok/properties/abc123.webp' })
  url: string;

  @ApiProperty({ example: 'zatyshok/properties/abc123' })
  publicId: string;

  @ApiProperty({ example: 1200 })
  width: number;

  @ApiProperty({ example: 800 })
  height: number;

  @ApiProperty({ example: 145032, description: 'Розмір у байтах після стиснення' })
  bytes: number;
}

export class UploadResponseDto {
  @ApiProperty({ type: [UploadedFileDto] })
  files: UploadedFileDto[];
}
