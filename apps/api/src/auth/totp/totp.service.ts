import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';

/** TOTP MFA (RFC 6238) for admin accounts. */
@Injectable()
export class TotpService {
  constructor(private readonly config: ConfigService) {}

  generateSecret(): string {
    return authenticator.generateSecret();
  }

  /** otpauth:// URI to render as a QR code during enrolment. */
  keyUri(accountEmail: string, secret: string): string {
    const issuer = this.config.get<string>('TOTP_ISSUER') ?? 'RFM Loyalty';
    return authenticator.keyuri(accountEmail, issuer, secret);
  }

  verify(token: string, secret: string): boolean {
    try {
      return authenticator.verify({ token, secret });
    } catch {
      return false;
    }
  }
}
