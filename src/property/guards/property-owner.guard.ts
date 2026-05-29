import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Перевіряє, що авторизований HOST є власником об'єкта.
 * Бере :id або :slug з params.
 * Використовується разом з JwtAuthGuard.
 */
@Injectable()
export class PropertyOwnerGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const { id, slug } = request.params as { id?: string; slug?: string };

    // ADMIN може все
    if (user.role === 'ADMIN') return true;

    const property = await this.prisma.property.findFirst({
      where: id ? { id } : { slug },
      select: { hostId: true },
    });

    if (!property) {
      throw new NotFoundException('Об\'єкт не знайдено');
    }

    if (property.hostId !== user.id) {
      throw new ForbiddenException('Доступ заборонено: ви не є власником цього об\'єкта');
    }

    return true;
  }
}
