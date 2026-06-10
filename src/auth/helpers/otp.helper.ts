import {
  OTP_MIN,
  OTP_MAX,
  OTP_EXPIRY_SECONDS,
  OTP_REDIS_PREFIX,
} from '../auth.constants';

export function generateOtp(): string {
  return Math.floor(
    OTP_MIN + Math.random() * (OTP_MAX - OTP_MIN + 1),
  ).toString();
}

export function getOtpRedisKey(phone: string): string {
  return `${OTP_REDIS_PREFIX}${phone}`;
}

export function getOtpExpirySeconds(): number {
  return OTP_EXPIRY_SECONDS;
}
