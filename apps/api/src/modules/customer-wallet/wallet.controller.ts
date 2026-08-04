import {
  BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from '../../auth/auth.service';
import { CurrentWallet } from '../../auth/decorators/current-wallet.decorator';
import { WalletJwtGuard, type WalletPrincipal } from '../../auth/guards/wallet-jwt.guard';
import { SetEmailDto, SetHomeBranchDto, UpdateWalletProfileDto } from './dto';
import { CustomerWalletService } from './wallet.service';

/**
 * The customer app's home surface. Person-scoped and brand-agnostic — the
 * wallet spans every brand someone belongs to, which the brand-scoped
 * `/customer/*` endpoints cannot express.
 */
@ApiTags('customer')
@ApiBearerAuth()
@Controller('customer/wallet')
@UseGuards(WalletJwtGuard)
export class CustomerWalletController {
  constructor(
    private readonly wallet: CustomerWalletService,
    private readonly auth: AuthService,
  ) {}

  @Get('cards')
  @ApiOperation({ summary: 'Every card in the wallet, with balance and tier progress.' })
  cards(@CurrentWallet() me: WalletPrincipal) {
    return this.wallet.cards(me.personId);
  }

  @Get('vouchers')
  @ApiOperation({ summary: 'Rewards held across all brands.' })
  vouchers(@CurrentWallet() me: WalletPrincipal) {
    return this.wallet.vouchers(me.personId);
  }

  @Get('activity')
  @ApiOperation({ summary: 'One timeline across every brand: points and reward events.' })
  activity(@CurrentWallet() me: WalletPrincipal, @Query('limit') limit?: string) {
    const n = Number(limit);
    return this.wallet.activity(me.personId, Number.isFinite(n) && n > 0 ? Math.min(n, 200) : 60);
  }

  @Get('profile')
  @ApiOperation({ summary: 'The signed-in person’s own details.' })
  profile(@CurrentWallet() me: WalletPrincipal) {
    return this.wallet.profile(me.personId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Edit name, gender or birthdate.' })
  updateProfile(@CurrentWallet() me: WalletPrincipal, @Body() dto: UpdateWalletProfileDto) {
    return this.wallet.updateProfile(me.personId, dto);
  }

  @Get('brands')
  @ApiOperation({ summary: 'Brands to discover and join.' })
  brands(@CurrentWallet() me: WalletPrincipal) {
    return this.wallet.brands(me.personId);
  }

  @Post('brands/:brandId/join')
  @ApiOperation({ summary: 'Join a brand from the app and get a card.' })
  join(@CurrentWallet() me: WalletPrincipal, @Param('brandId') brandId: string) {
    return this.wallet.joinBrand(me.personId, brandId);
  }

  @Get('cards/:brandId/scan-code')
  @ApiOperation({ summary: 'The value to show as a QR at this brand’s till.' })
  scanCode(@CurrentWallet() me: WalletPrincipal, @Param('brandId') brandId: string) {
    return this.wallet.scanCode(me.personId, brandId);
  }

  /**
   * Trade the wallet session for a brand-scoped one, so a card's detail screens
   * can use the existing per-brand customer endpoints. Membership is re-checked
   * server-side rather than trusted from the wallet token.
   */
  @Post('cards/:brandId/token')
  @ApiOperation({ summary: 'Mint a brand-scoped customer token for one card.' })
  brandToken(@CurrentWallet() me: WalletPrincipal, @Param('brandId') brandId: string) {
    return this.auth.brandTokenForWallet(me.personId, brandId);
  }

  @Patch('email')
  @ApiOperation({ summary: 'Set or clear the signed-in person’s email address.' })
  setEmail(@CurrentWallet() me: WalletPrincipal, @Body() dto: SetEmailDto) {
    return this.wallet.setEmail(me.personId, dto.email ?? null);
  }

  @Get('branch-visits')
  @ApiOperation({ summary: 'Branches this person visits, busiest first — the home-area suggestion.' })
  branchVisits(@CurrentWallet() me: WalletPrincipal) {
    return this.wallet.branchVisits(me.personId);
  }

  @Patch('home-branch')
  @ApiOperation({ summary: 'Set or clear the home area. Null clears it.' })
  setHomeBranch(@CurrentWallet() me: WalletPrincipal, @Body() dto: SetHomeBranchDto) {
    return this.wallet.setHomeBranch(me.personId, dto.branchId ?? null);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Devices currently signed in to this wallet.' })
  sessions(@CurrentWallet() me: WalletPrincipal) {
    return this.wallet.sessions(me.personId, me.sessionId);
  }

  /**
   * Sign another device out. The caller's own session is refused rather than
   * silently ignored — someone tapping it means to sign out, and Sign out is a
   * different button that also clears the tokens on this device.
   */
  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Sign one other device out of this wallet.' })
  revokeSession(@CurrentWallet() me: WalletPrincipal, @Param('id') id: string) {
    if (me.sessionId && id === me.sessionId) {
      throw new BadRequestException('use sign out to end this device’s session');
    }
    return this.wallet.revokeSession(me.personId, id);
  }
}
