import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RedisModule } from '../redis/redis.module';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    RedisModule,
    PrismaModule,
    PassportModule,
    ConfigModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'fallback_secret_key',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    {
      provide: 'BOT_TOKEN',
      useFactory: (config: ConfigService) => config.get<string>('BOT_TOKEN'),
      inject: [ConfigService],
    },
    {
      provide: 'BOT_CHAT_ID',
      useFactory: (config: ConfigService) => config.get<string>('BOT_CHAT_ID'),
      inject: [ConfigService],
    },
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
