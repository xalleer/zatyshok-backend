import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Перевіряє що HOST є власником Property, до якої належить Unit.
 * Бере :unitId або :id з params.
 */
@Injectable()
export class UnitOwnerGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user.role === 'ADMIN') return true;

    const unitId = request.params.unitId ?? request.params.id;

    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { property: { select: { hostId: true } } },
    });

    if (!unit) {
      throw new NotFoundException('Юніт не знайдено');
    }

    if (unit.property.hostId !== user.id) {
      throw new ForbiddenException(
        "Доступ заборонено: ви не є власником цього об'єкта",
      );
    }

    return true;
  }
}
