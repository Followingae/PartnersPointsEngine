import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * What the customer app should do before it shows anything.
 *
 * Deliberately unauthenticated and dependency-free: it is the one call the app
 * makes when it cannot yet trust its own build, and requiring a session to
 * discover that the session format has changed would be circular.
 *
 * `minVersion` is the oldest build the ledger will still answer. Below it the
 * app shows 68 · Update required and stops, because a build that cannot read
 * the ledger correctly must not show balances at all — whatever it displayed
 * would be wrong.
 */
@ApiTags('customer')
@Controller('customer/app-status')
export class AppStatusController {
  @Get()
  @ApiOperation({ summary: 'Minimum supported app build, and whether the API is accepting traffic.' })
  status() {
    return {
      // Bumped deliberately, never automatically: shutting every old install
      // out of their own cards is not a side effect anyone should cause by
      // cutting a release.
      minVersion: process.env.APP_MIN_VERSION ?? '0.0.0',
      // Set when the ledger is being worked on. The app shows 67 · Maintenance.
      maintenance: process.env.APP_MAINTENANCE === '1',
      message: process.env.APP_MAINTENANCE_MESSAGE ?? null,
    };
  }
}
