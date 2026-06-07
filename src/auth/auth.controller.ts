import { Controller, Post, Body, Res, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { setAuthCookie, clearAuthCookie } from './helpers/cookie.helper';
import type { Response } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('send-otp')
  @ApiOperation({ summary: 'Send OTP to phone number' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiBody({ type: SendOtpDto })
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto.phone);
  }

  @Post('verify-otp')
  @ApiOperation({ summary: 'Verify OTP and authenticate user' })
  @ApiResponse({ status: 200, description: 'Authentication successful' })
  @ApiResponse({ status: 400, description: 'Invalid OTP' })
  @ApiBody({ type: VerifyOtpDto })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user, message, property } =
      await this.authService.verifyOtp(dto);

    setAuthCookie(res, accessToken);

    return { message, user, property };
  }

  @Get('check-auth')
  @ApiOperation({ summary: 'Test auth' })
  @ApiResponse({ status: 200, description: 'User autorized' })
  @UseGuards(JwtAuthGuard)
  async testAuth(@CurrentUser('id') userId: string) {
    const { user, message } = await this.authService.checkAuth(userId);

    return { message, user };
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  logout(@Res({ passthrough: true }) res: Response) {
    clearAuthCookie(res);
    return { message: 'Logged out successfully' };
  }
}
