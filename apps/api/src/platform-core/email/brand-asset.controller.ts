import { Controller, Get, Header, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { LOGO_PNG } from './logo.asset';

/**
 * Public brand assets.
 *
 * Emails and the receipt page need the logo at a URL an email client will
 * fetch — a local file or a data URI won't do, since several clients strip
 * base64 images. Cached hard: this changes when the brand changes, which is
 * roughly never.
 */
@ApiExcludeController()
@Controller('assets')
export class BrandAssetController {
  @Get('logo.png')
  @Header('Content-Type', 'image/png')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  logo(@Res() res: Response): void {
    res.send(LOGO_PNG);
  }
}
