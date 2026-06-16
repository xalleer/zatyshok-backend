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
    timeoutMs = 60000,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout;

      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          format: 'webp',
          transformation: [{ width: 1600, crop: 'limit' }, { quality: 80 }],
        },
        (error, result) => {
          clearTimeout(timeoutId);
          if (
            error?.message?.includes('timeout') ||
            error?.name === 'TimeoutError'
          ) {
            return reject(
              new BadRequestException(
                "Час очікування завантаження вичерпано. Спробуйте файл меншого розміру або перевірте з'єднання.",
              ),
            );
          }
          if (error || !result)
            return reject(error ?? new Error('Cloudinary upload failed'));
          resolve(result);
        },
      );

      timeoutId = setTimeout(() => {
        stream.destroy();
        reject(
          new BadRequestException(
            'Час очікування завантаження вичерпано (60 сек). Спробуйте файл меншого розміру.',
          ),
        );
      }, timeoutMs);

      stream.on('error', (err) => {
        clearTimeout(timeoutId);
        this.logger.error(`Cloudinary stream error: ${err.message}`, err.stack);
        reject(
          new BadRequestException(
            "Помилка завантаження файлу. Перевірте з'єднання з інтернетом.",
          ),
        );
      });

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

    this.logger.log(
      `Завантажено ${results.length} файлів у Cloudinary (${folder})`,
    );

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
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!property) {
      throw new NotFoundException(
        "Об'єкт не знайдено або ви не є його власником",
      );
    }

    const { files: uploaded } = await this.uploadMany(
      files,
      CLOUDINARY_FOLDER.PROPERTY,
    );

    const newUrls = uploaded.map((f) => f.url);
    const startOrder = property.images.length;

    await this.prisma.image.createMany({
      data: newUrls.map((url, index) => ({
        url,
        propertyId,
        sortOrder: startOrder + index,
      })),
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
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!property) {
      throw new NotFoundException(
        "Об'єкт не знайдено або ви не є його власником",
      );
    }

    const image = property.images.find((item) => item.url === imageUrl);
    if (!image) {
      throw new BadRequestException(
        "Вказаний URL не знайдено серед фотографій цього об'єкта",
      );
    }

    await this.prisma.image.update({
      where: { id: image.id },
      data: { sortOrder: 0 },
    });

    return { coverImage: imageUrl };
  }

  /**
   * Завантажує файл та встановлює його як обкладинку.
   * Файл додається до масиву images та стає coverImage.
   */
  async uploadCoverImage(
    propertyId: string,
    hostId: string,
    file: Express.Multer.File,
  ): Promise<{ coverImage: string }> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, hostId },
      include: { images: true },
    });

    if (!property) {
      throw new NotFoundException(
        "Об'єкт не знайдено або ви не є його власником",
      );
    }

    this.validateFile(file);

    try {
      const result = await this.uploadToCloudinary(
        file,
        CLOUDINARY_FOLDER.PROPERTY,
      );
      const imageUrl = result.secure_url;

      await this.prisma.image.create({
        data: {
          url: imageUrl,
          propertyId,
          sortOrder: 0,
        },
      });

      return { coverImage: imageUrl };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(
        `Cloudinary upload failed: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        'Не вдалося завантажити файл. Сервіс тимчасово недоступний.',
      );
    }
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
      include: { images: true },
    });

    if (!property) {
      throw new NotFoundException(
        "Об'єкт не знайдено або ви не є його власником",
      );
    }

    const image = property.images.find((item) => item.url === imageUrl);
    if (!image) {
      throw new BadRequestException("Фото не знайдено в цьому об'єкті");
    }

    await this.prisma.image.delete({ where: { id: image.id } });

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
      include: { images: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!unit) {
      throw new NotFoundException(
        "Юніт не знайдено або ви не є власником об'єкта",
      );
    }

    const { files: uploaded } = await this.uploadMany(
      files,
      CLOUDINARY_FOLDER.UNIT,
    );

    const newUrls = uploaded.map((f) => f.url);
    const startOrder = unit.images.length;

    await this.prisma.image.createMany({
      data: newUrls.map((url, index) => ({
        url,
        unitId,
        sortOrder: startOrder + index,
      })),
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
      include: { images: true },
    });

    if (!unit) {
      throw new NotFoundException(
        "Юніт не знайдено або ви не є власником об'єкта",
      );
    }

    const image = unit.images.find((item) => item.url === imageUrl);
    if (!image) {
      throw new BadRequestException('Фото не знайдено в цьому юніті');
    }

    await this.prisma.image.delete({ where: { id: image.id } });

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
      this.logger.warn(
        `Не вдалося видалити файл з Cloudinary: ${imageUrl}`,
        err,
      );
    }
  }
}
