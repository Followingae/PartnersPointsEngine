import {
  Controller, Delete, Get, Headers, HttpCode, Param, Post, Query, Req, Res, UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PassKitService } from './passkit.service';

/**
 * The PassKit web service — the endpoints iOS itself calls.
 *
 * Paths and status codes are dictated by Apple, not chosen. In particular the
 * device expects 200 with a body, 204 for "nothing changed", and 401 when the
 * token is wrong; anything else and it quietly stops asking.
 *
 * Note these live at `/v1/...` by Apple's own convention as well as ours — the
 * `v1` in `webServiceURL` is the *protocol* version Apple requires, and it
 * coinciding with our API prefix is a happy accident rather than a design.
 *
 * Unauthenticated in our sense: the caller is a device, not a person, and it
 * carries the per-pass token embedded in the pass. Excluded from the throttler
 * because a customer with several cards legitimately registers several times in
 * a burst.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller('devices')
export class PassKitWebController {
  constructor(private readonly passkit: PassKitService) {}

  private authorise(header: string | undefined, serial: string): void {
    // Apple sends `Authorization: ApplePass <token>`.
    const token = (header ?? '').replace(/^ApplePass\s+/i, '').trim();
    if (!this.passkit.verifyPassAuth(serial, token)) {
      throw new UnauthorizedException();
    }
  }

  /** The device asks to be told about a pass. */
  @Post(':deviceLibraryId/registrations/:passTypeId/:serialNumber')
  @HttpCode(201)
  async register(
    @Param('deviceLibraryId') deviceLibraryId: string,
    @Param('passTypeId') passTypeId: string,
    @Param('serialNumber') serialNumber: string,
    @Headers('authorization') auth: string | undefined,
    @Req() req: Request & { body?: { pushToken?: string } },
    @Res() res: Response,
  ) {
    this.authorise(auth, serialNumber);
    const pushToken = req.body?.pushToken;
    if (!pushToken) return res.status(400).send();

    const { created } = await this.passkit.register(
      deviceLibraryId, serialNumber, pushToken, passTypeId,
    );
    // 200 tells the device it was already registered; 201 that it is new.
    res.status(created ? 201 : 200).send();
  }

  @Delete(':deviceLibraryId/registrations/:passTypeId/:serialNumber')
  async unregister(
    @Param('deviceLibraryId') deviceLibraryId: string,
    @Param('serialNumber') serialNumber: string,
    @Headers('authorization') auth: string | undefined,
    @Res() res: Response,
  ) {
    this.authorise(auth, serialNumber);
    await this.passkit.unregister(deviceLibraryId, serialNumber);
    res.status(200).send();
  }

  /**
   * Which of this device's passes have changed.
   *
   * 204 means nothing has. Returning 200 with an empty list instead makes the
   * device fetch every pass it holds, every time.
   */
  @Get(':deviceLibraryId/registrations/:passTypeId')
  async serials(
    @Param('deviceLibraryId') deviceLibraryId: string,
    @Param('passTypeId') passTypeId: string,
    @Query('passesUpdatedSince') since: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.passkit.changedSerials(deviceLibraryId, passTypeId, since);
    if (!result) return res.status(204).send();
    res.status(200).json(result);
  }
}

/**
 * Fetching an updated pass, and Apple's error log.
 *
 * Separate controller only because Apple puts these under a different path
 * root than the device registrations above.
 */
@ApiExcludeController()
@SkipThrottle()
@Controller()
export class PassKitPassController {
  constructor(private readonly passkit: PassKitService) {}

  @Get('passes/:passTypeId/:serialNumber')
  async latest(
    @Param('serialNumber') serialNumber: string,
    @Headers('authorization') auth: string | undefined,
    @Headers('if-modified-since') ifModifiedSince: string | undefined,
    @Res() res: Response,
  ) {
    const token = (auth ?? '').replace(/^ApplePass\s+/i, '').trim();
    if (!this.passkit.verifyPassAuth(serialNumber, token)) throw new UnauthorizedException();

    const pass = await this.passkit.latestPass(serialNumber, ifModifiedSince);
    if (!pass) return res.status(304).send();

    res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
    res.setHeader('Last-Modified', pass.lastModified.toUTCString());
    res.send(pass.bytes);
  }

  /**
   * Apple posts here when a device cannot use a pass we served.
   *
   * Worth keeping: it is the only channel that reports a malformed pass, and
   * the alternative is a customer whose card silently stopped updating.
   */
  @Post('log')
  @HttpCode(200)
  log(@Req() req: Request & { body?: { logs?: string[] } }) {
    this.passkit.recordDeviceLogs(req.body?.logs ?? []);
    return {};
  }
}
