import {
  Controller,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MediaService } from './media.service';
import { UploadResponseDto } from './dto/upload-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MAX_FILES_PER_REQUEST } from './media.constants';

@ApiTags('media')
@Controller('media')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  // ─── Property images ──────────────────────────────────────────────────────

  /**
   * POST /media/properties/:propertyId/images
   * Завантажити до 10 фото для об'єкта.
   * Перше фото автоматично стає обкладинкою якщо її ще немає.
   */
  @Post('properties/:propertyId/images')
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_REQUEST, {
      storage: memoryStorage(),
    }),
  )
  @ApiOperation({
    summary: "Завантажити фото для об'єкта (до 10 файлів)",
    description: 'Файли конвертуються у WebP та стискаються автоматично.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiParam({ name: 'propertyId' })
  @ApiResponse({ status: 201, type: UploadResponseDto })
  uploadPropertyImages(
    @Param('propertyId') propertyId: string,
    @CurrentUser('id') hostId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<UploadResponseDto> {
    if (!files?.length) {
      throw new BadRequestException('Файли не передано');
    }
    return this.mediaService.uploadForProperty(propertyId, hostId, files);
  }

  /**
   * PATCH /media/properties/:propertyId/cover
   * Завантажити файл та встановити його як обкладинку.
   */
  @Patch('properties/:propertyId/cover')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
    }),
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Завантажити та встановити обкладинку об'єкта" })
  @ApiParam({ name: 'propertyId' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    schema: { properties: { coverImage: { type: 'string' } } },
  })
  setCover(
    @Param('propertyId') propertyId: string,
    @CurrentUser('id') hostId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ coverImage: string }> {
    if (!file) throw new BadRequestException('Файл не передано');
    return this.mediaService.uploadCoverImage(propertyId, hostId, file);
  }

  /**
   * DELETE /media/properties/:propertyId/images
   * Видалити одне фото (передається URL у body).
   */
  @Delete('properties/:propertyId/images')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Видалити фото об'єкта" })
  @ApiParam({ name: 'propertyId' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { imageUrl: { type: 'string' } },
    },
  })
  @ApiResponse({
    status: 200,
    schema: { properties: { message: { type: 'string' } } },
  })
  deletePropertyImage(
    @Param('propertyId') propertyId: string,
    @CurrentUser('id') hostId: string,
    @Body('imageUrl') imageUrl: string,
  ): Promise<{ message: string }> {
    if (!imageUrl) throw new BadRequestException('imageUrl не вказано');
    return this.mediaService.deletePropertyImage(propertyId, hostId, imageUrl);
  }

  // ─── Unit images ──────────────────────────────────────────────────────────

  /**
   * POST /media/units/:unitId/images
   * Завантажити фото для конкретного юніта (альтанки, будиночка).
   */
  @Post('units/:unitId/images')
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_REQUEST, {
      storage: memoryStorage(),
    }),
  )
  @ApiOperation({ summary: 'Завантажити фото для юніта (до 10 файлів)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiParam({ name: 'unitId' })
  @ApiResponse({ status: 201, type: UploadResponseDto })
  uploadUnitImages(
    @Param('unitId') unitId: string,
    @CurrentUser('id') hostId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<UploadResponseDto> {
    if (!files?.length) {
      throw new BadRequestException('Файли не передано');
    }
    return this.mediaService.uploadForUnit(unitId, hostId, files);
  }

  /**
   * DELETE /media/units/:unitId/images
   * Видалити одне фото юніта.
   */
  @Delete('units/:unitId/images')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Видалити фото юніта' })
  @ApiParam({ name: 'unitId' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { imageUrl: { type: 'string' } },
    },
  })
  @ApiResponse({
    status: 200,
    schema: { properties: { message: { type: 'string' } } },
  })
  deleteUnitImage(
    @Param('unitId') unitId: string,
    @CurrentUser('id') hostId: string,
    @Body('imageUrl') imageUrl: string,
  ): Promise<{ message: string }> {
    if (!imageUrl) throw new BadRequestException('imageUrl не вказано');
    return this.mediaService.deleteUnitImage(unitId, hostId, imageUrl);
  }
}
