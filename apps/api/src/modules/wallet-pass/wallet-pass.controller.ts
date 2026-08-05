import { Controller, Get, Header, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentWallet } from '../../auth/decorators/current-wallet.decorator';
import { WalletJwtGuard, type WalletPrincipal } from '../../auth/guards/wallet-jwt.guard';
import { WalletPassService } from './wallet-pass.service';

/**
 * Apple Wallet and Google Wallet passes for the signed-in customer's cards.
 *
 * Sits under the person-scoped wallet surface rather than the brand-scoped one:
 * a customer adds a pass for a card they hold, and which brand it belongs to
 * follows from the membership.
 */
@ApiTags('customer')
@ApiBearerAuth()
@Controller('customer/wallet/passes')
@UseGuards(WalletJwtGuard)
export class WalletPassController {
  constructor(private readonly passes: WalletPassService) {}

  @Get('availability')
  @ApiOperation({ summary: 'Which wallet buttons to show — Apple, Google, or neither.' })
  availability() {
    return this.passes.availability();
  }

  @Get(':membershipId/google')
  @ApiOperation({ summary: 'The "Add to Google Wallet" save link for one card.' })
  google(@CurrentWallet() me: WalletPrincipal, @Param('membershipId') membershipId: string) {
    return this.passes.googleSaveLink(me.personId, membershipId);
  }

  @Get(':membershipId/apple')
  @ApiOperation({ summary: 'A short-lived URL the phone opens to add the pass.' })
  appleLink(@CurrentWallet() me: WalletPrincipal, @Param('membershipId') membershipId: string) {
    return this.passes.appleLink(me.personId, membershipId);
  }
}

/**
 * Where an Apple pass link actually lands.
 *
 * Unauthenticated by design: iOS leaves the app to open the pass, so no bearer
 * token survives the hop. The signed, five-minute, single-membership token in
 * the path is the credential — see WalletPassService.appleLink.
 */
@ApiTags('customer')
@Controller('passes/apple')
export class ApplePassLinkController {
  constructor(private readonly passes: WalletPassService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Serves the .pkpass a signed link points at.' })
  @Header('Content-Type', 'application/vnd.apple.pkpass')
  async serve(@Param('token') token: string, @Res() res: Response) {
    const pass = await this.passes.applePassFromLink(token);
    // Named so it stays recognisable if it lands in Files rather than opening
    // straight into Wallet.
    res.setHeader('Content-Disposition', 'attachment; filename="partners-points.pkpass"');
    res.send(pass);
  }
}
