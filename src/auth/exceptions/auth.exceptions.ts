import { HttpException, HttpStatus } from '@nestjs/common';

export class InvalidOtpException extends HttpException {
  constructor() {
    super('Invalid OTP or expired', HttpStatus.BAD_REQUEST);
  }
}

export class OtpExpiredException extends HttpException {
  constructor() {
    super('OTP has expired', HttpStatus.BAD_REQUEST);
  }
}

export class UserNotFoundException extends HttpException {
  constructor() {
    super('User not found', HttpStatus.NOT_FOUND);
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = 'Unauthorized') {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}
