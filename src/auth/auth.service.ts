import { Injectable, Inject } from '@nestjs/common';
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

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  async sendOtp(phone: string) {
    const otpCode = generateOtp();
    const redisKey = getOtpRedisKey(phone);
    const expiry = getOtpExpirySeconds();

    await this.redis.set(redisKey, otpCode, 'EX', expiry);

    console.log(`[MOCK SMS] OTP ${otpCode} sent to ${phone}`);

    return { message: 'OTP sent successfully', expiresIn: `${expiry} seconds` };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const { phone, code } = dto;
    const redisKey = getOtpRedisKey(phone);
    const savedCode = await this.redis.get(redisKey);

    if (!savedCode || savedCode !== code) {
      throw new InvalidOtpException();
    }

    await this.redis.del(redisKey);

    let user = await this.prisma.user.findUnique({ where: { phone } });

    if (!user) {
      user = await this.prisma.user.create({
        data: { phone, role: DEFAULT_USER_ROLE },
      });
    }

    const payload = { sub: user.id, role: user.role };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: JWT_EXPIRES_IN,
    });

    return {
      message: 'Authentication successful',
      user,
      accessToken,
    };
  }
}
