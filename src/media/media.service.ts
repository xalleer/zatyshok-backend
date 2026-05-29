import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { UploadedFileDto, UploadResponseDto } from './dto/upload-response.dto';
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  CLOUDINARY_FOLDER,
} from './media.constants';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    cloudinary.config({
      cloud_name: this.config.get('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.get('CLOUDINARY_API_KEY'),
      api_secret: this.config.get('CLOUDINARY_API_SECRET'),
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private validateFile(file: Express.Multer.File): void {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Непідтримуваний формат файлу: ${file.mimetype}. ` +
        `Дозволено: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      const maxMb = MAX_FILE_SIZE_BYTES / 1024 / 1024;
      throw new BadRequestException(
        `Файл "${file.originalname}" завеликий. Максимум — ${maxMb} МБ.`,
      );
    }
  }

  /**
   * Завантажує один файл у Cloudinary через stream.
   * Автоматично конвертує у WebP, стискає до якості 80,
   * і обмежує ширину до 1600px (зберігаючи пропорції).
   */
  private uploadToCloudinary(
    file: Express.Multer.File,
    folder: string,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          format: 'webp',
          transformation: [
            { width: 1600, crop: 'limit' },
            { quality: 80 },
          ],
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
          resolve(result);
        },
      );

      Readable.from(file.buffer).pipe(stream);
    });
  }

  private formatResult(result: UploadApiResponse): UploadedFileDto {
    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
    };
  }

  // ─── Core upload ──────────────────────────────────────────────────────────

  async uploadMany(
    files: Express.Multer.File[],
    folder: string,
  ): Promise<UploadResponseDto> {
    files.forEach((f) => this.validateFile(f));

    const results = await Promise.all(
      files.map((f) => this.uploadToCloudinary(f, folder)),
    );

    this.logger.log(`Завантажено ${results.length} файлів у Cloudinary (${folder})`);

    return { files: results.map((r) => this.formatResult(r)) };
  }

  // ─── Property media ───────────────────────────────────────────────────────

  /**
   * Завантажує фото та прикріплює до Property.
   * Перший завантажений файл стає обкладинкою (coverImage),
   * якщо вона ще не встановлена.
   * Всі URL додаються до масиву Property.images.
   */
  async uploadForProperty(
    propertyId: string,
    hostId: string,
    files: Express.Multer.File[],
  ): Promise<UploadResponseDto> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, hostId },
    });

    if (!property) {
      throw new NotFoundException(
        'Об\'єкт не знайдено або ви не є його власником',
      );
    }

    const { files: uploaded } = await this.uploadMany(
      files,
      CLOUDINARY_FOLDER.PROPERTY,
    );

    const newUrls = uploaded.map((f) => f.url);

    await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        images: { push: newUrls },
        // Встановлюємо coverImage якщо ще немає
        ...(!property.coverImage && { coverImage: newUrls[0] }),
      },
    });

    return { files: uploaded };
  }

  /**
   * Встановлює конкретне фото як обкладинку.
   * URL має вже бути в масиві Property.images.
   */
  async setCoverImage(
    propertyId: string,
    hostId: string,
    imageUrl: string,
  ): Promise<{ coverImage: string }> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, hostId },
    });

    if (!property) {
      throw new NotFoundException(
        'Об\'єкт не знайдено або ви не є його власником',
      );
    }

    if (!property.images.includes(imageUrl)) {
      throw new BadRequestException(
        'Вказаний URL не знайдено серед фотографій цього об\'єкта',
      );
    }

    await this.prisma.property.update({
      where: { id: propertyId },
      data: { coverImage: imageUrl },
    });

    return { coverImage: imageUrl };
  }

  /**
   * Видаляє фото з масиву Property.images.
   * Якщо видалене фото було обкладинкою — обкладинкою стає наступне фото.
   * Також видаляє файл з Cloudinary.
   */
  async deletePropertyImage(
    propertyId: string,
    hostId: string,
    imageUrl: string,
  ): Promise<{ message: string }> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, hostId },
    });

    if (!property) {
      throw new NotFoundException(
        'Об\'єкт не знайдено або ви не є його власником',
      );
    }

    if (!property.images.includes(imageUrl)) {
      throw new BadRequestException('Фото не знайдено в цьому об\'єкті');
    }

    const updatedImages = property.images.filter((url) => url !== imageUrl);

    // Якщо видалили обкладинку — призначаємо нову
    const newCover =
      property.coverImage === imageUrl
        ? (updatedImages[0] ?? null)
        : property.coverImage;

    await this.prisma.property.update({
      where: { id: propertyId },
      data: { images: updatedImages, coverImage: newCover },
    });

    // Видаляємо з Cloudinary (best-effort — не кидаємо помилку якщо не вдалося)
    await this.deleteFromCloudinary(imageUrl);

    return { message: 'Фото успішно видалено' };
  }

  // ─── Unit media ───────────────────────────────────────────────────────────

  async uploadForUnit(
    unitId: string,
    hostId: string,
    files: Express.Multer.File[],
  ): Promise<UploadResponseDto> {
    const unit = await this.prisma.unit.findFirst({
      where: {
        id: unitId,
        property: { hostId },
      },
    });

    if (!unit) {
      throw new NotFoundException(
        'Юніт не знайдено або ви не є власником об\'єкта',
      );
    }

    const { files: uploaded } = await this.uploadMany(
      files,
      CLOUDINARY_FOLDER.UNIT,
    );

    const newUrls = uploaded.map((f) => f.url);

    await this.prisma.unit.update({
      where: { id: unitId },
      data: { images: { push: newUrls } },
    });

    return { files: uploaded };
  }

  async deleteUnitImage(
    unitId: string,
    hostId: string,
    imageUrl: string,
  ): Promise<{ message: string }> {
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, property: { hostId } },
    });

    if (!unit) {
      throw new NotFoundException(
        'Юніт не знайдено або ви не є власником об\'єкта',
      );
    }

    if (!unit.images.includes(imageUrl)) {
      throw new BadRequestException('Фото не знайдено в цьому юніті');
    }

    await this.prisma.unit.update({
      where: { id: unitId },
      data: { images: unit.images.filter((url) => url !== imageUrl) },
    });

    await this.deleteFromCloudinary(imageUrl);

    return { message: 'Фото успішно видалено' };
  }

  // ─── Cloudinary delete ────────────────────────────────────────────────────

  private async deleteFromCloudinary(imageUrl: string): Promise<void> {
    try {
      // Витягуємо public_id із URL
      // Приклад: https://res.cloudinary.com/zatyshok/image/upload/v1234/zatyshok/properties/abc.webp
      // → public_id: zatyshok/properties/abc
      const match = imageUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
      if (!match) return;

      const publicId = match[1];
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      this.logger.warn(`Не вдалося видалити файл з Cloudinary: ${imageUrl}`, err);
    }
  }
}
