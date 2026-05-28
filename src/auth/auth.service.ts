import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async sendOtp(phone: string) {
    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();

    await this.redis.set(`otp:${phone}`, otpCode, 'EX', 300);

    // ТУТ БУДЕ ІНТЕГРАЦІЯ З ТУРБО СМС АБО ТЕЛЕГРАМ БОТОМ
    // Поки що просто виводимо в консоль для тестування
    console.log(`[MOCK SMS] Відправлено код ${otpCode} на номер ${phone}`);

    return { message: 'Код успішно відправлено', expiresIn: '5 minutes' };
  }

  async verifyOtp(phone: string, code: string) {
    const savedCode = await this.redis.get(`otp:${phone}`);

    if (!savedCode || savedCode !== code) {
      throw new BadRequestException('Невірний код або термін його дії минув');
    }

    await this.redis.del(`otp:${phone}`);

    let user = await this.prisma.user.findUnique({ where: { phone } });

    if (!user) {
      user = await this.prisma.user.create({
        data: { phone, role: 'CLIENT' },
      });
    }

    // TODO: Згенерувати та повернути JWT токен
    return {
      message: 'Успішна авторизація',
      user,
      accessToken: 'тут-буде-jwt-токен'
    };
  }
}
