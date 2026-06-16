import type { Response } from 'express';
import { COOKIE_MAX_AGE_MS, ACCESS_TOKEN_COOKIE_NAME } from '../auth.constants';

export function setAuthCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  // res.cookie(ACCESS_TOKEN_COOKIE_NAME, token, {
  //   httpOnly: true,
  //   secure: process.env.NODE_ENV === 'production',
  //   sameSite: 'lax',
  //   maxAge: COOKIE_MAX_AGE_MS,
  // });
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: COOKIE_MAX_AGE_MS,
    partitioned: true,
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME);
}
