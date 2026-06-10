import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Redis from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import {
  generateOtp,
  getOtpRedisKey,
  getOtpExpirySeconds,
} from './helpers/otp.helper';
import { DEFAULT_USER_ROLE, JWT_EXPIRES_IN } from './auth.constants';
import { InvalidOtpException } from './exceptions/auth.exceptions';
import { Role } from '../../prisma/generated/enums';
import { Telegraf } from 'telegraf';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly bot: Telegraf;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @Inject('BOT_TOKEN') private readonly botToken: string,
    @Inject('BOT_CHAT_ID') private readonly botChatId: string,
  ) {
    this.bot = new Telegraf(this.botToken);
  }

  async sendOtp(phone: string) {
    const otpCode = generateOtp();
    const redisKey = getOtpRedisKey(phone);
    const expiry = getOtpExpirySeconds();

    await this.redis.set(redisKey, otpCode, 'EX', expiry);

    try {
      await this.bot.telegram.sendMessage(
        this.botChatId,
        `🔐 OTP код для ${phone}: <b>${otpCode}</b>\n\nДійсний ${expiry / 60} хв`,
        { parse_mode: 'HTML' },
      );
      this.logger.log(`OTP ${otpCode} sent to Telegram for ${phone}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP via Telegram: ${error.message}`);
    }

    return { message: 'OTP sent successfully', expiresIn: `${expiry} seconds` };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const { phone, code, role } = dto;
    const redisKey = getOtpRedisKey(phone);
    const savedCode = await this.redis.get(redisKey);

    if (!savedCode || savedCode !== code) {
      throw new InvalidOtpException();
    }

    await this.redis.del(redisKey);

    let user = await this.prisma.user.findUnique({ where: { phone } });

    if (!user) {
      user = await this.prisma.user.create({
        data: { phone, role: role ?? DEFAULT_USER_ROLE },
      });
    }

    const payload = { sub: user.id, role: user.role };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: JWT_EXPIRES_IN,
    });

    const property =
      user.role === Role.HOST
        ? await this.prisma.property.findFirst({ where: { hostId: user.id } })
        : null;

    return {
      message: 'Authentication successful',
      user,
      accessToken,
      property,
    };
  }

  async checkAuth(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      message: 'User authorized',
      user,
    };
  }
}
