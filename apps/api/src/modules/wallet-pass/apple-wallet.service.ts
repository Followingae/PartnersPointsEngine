import { createHash, createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import JSZip from 'jszip';
import forge from 'node-forge';
import type { PassData } from './pass-data';

/**
 * Apple Wallet passes.
 *
 * A `.pkpass` is a zip of `pass.json`, its images, a `manifest.json` of SHA-1
 * digests, and a detached PKCS#7 signature over that manifest. Apple validates
 * the chain to its WWDR intermediate, so all three of pass certificate, its
 * private key, and the WWDR certificate have to be present and agree.
 *
 * Requires:
 *   APPLE_PASS_TYPE_ID        pass.<reverse-dns>, from the developer account
 *   APPLE_TEAM_ID             10-character team identifier
 *   APPLE_PASS_CERT_P12       the Pass Type ID certificate, base64 .p12
 *   APPLE_PASS_CERT_PASSWORD  its export password
 *   APPLE_WWDR_CERT_PEM       Apple's WWDR intermediate, PEM
 *
 * Unconfigured, `issue` returns null rather than throwing, matching
 * GoogleWalletService: a brand without wallet passes still has a working app.
 *
 * Keeping a pass current after it is added is PassKitService's job. This class
 * only signs; it contributes the `webServiceURL` and `authenticationToken` that
 * let the device find that service.
 */

/**
 * Pluralises the reward noun for the remainder sentence.
 *
 * The design calls this out twice — "3 more coffees" against "1 more wash" —
 * so one remaining has to read singular, and "wash" has to become "washes"
 * rather than "washs".
 */
function plural(noun: string, n: number): string {
  if (n === 1) return noun;
  if (/(s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`;
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
}

/**
 * The object identifiers the signature needs.
 *
 * Named here rather than read from `forge.pki.oids`, whose lookups are typed as
 * possibly-undefined: an OID that silently came back undefined would produce a
 * signature Apple rejects without saying why.
 */
const OID = {
  certBag: '1.2.840.113549.1.12.10.1.3',
  pkcs8ShroudedKeyBag: '1.2.840.113549.1.12.10.1.2',
  data: '1.2.840.113549.1.7.1',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  signingTime: '1.2.840.113549.1.9.5',
  sha256: '2.16.840.1.101.3.4.2.1',
} as const;

@Injectable()
export class AppleWalletService {
  private readonly logger = new Logger(AppleWalletService.name);

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(
      this.config.get<string>('APPLE_PASS_TYPE_ID') &&
        this.config.get<string>('APPLE_TEAM_ID') &&
        this.config.get<string>('APPLE_PASS_CERT_P12') &&
        this.config.get<string>('APPLE_WWDR_CERT_PEM'),
    );
  }

  /**
   * The pass body.
   *
   * A stamp card and a points card are the same `storeCard` with different
   * fields, which is what the design asks for: the stamp version states its
   * progress as a sentence, the points version leads with the balance.
   */
  private passJson(d: PassData): Record<string, unknown> {
    const passTypeIdentifier = this.config.getOrThrow<string>('APPLE_PASS_TYPE_ID');
    const teamIdentifier = this.config.getOrThrow<string>('APPLE_TEAM_ID');

    const common = {
      formatVersion: 1,
      passTypeIdentifier,
      teamIdentifier,
      // Stable per membership, so re-issuing replaces the pass in place rather
      // than stacking duplicates in the customer's wallet.
      serialNumber: d.membershipId,
      organizationName: d.brandName,
      description: `${d.brandName} loyalty card`,
      logoText: d.brandName,
      backgroundColor: d.color,
      foregroundColor: '#FFFFFF',
      labelColor: '#FFFFFF',
      barcodes: [
        {
          format: 'PKBarcodeFormatQR',
          message: d.memberToken,
          messageEncoding: 'iso-8859-1',
          altText: d.loyaltyId,
        },
      ],
      associatedStoreIdentifiers: [] as number[],

      // Without these two the pass is inert: iOS never registers the device and
      // never asks for an update, so the balance stays frozen at whatever it
      // was when the card was added. Both are omitted rather than left blank
      // when the web service is not configured — a webServiceURL the device
      // cannot reach makes it retry forever.
      ...(this.webServiceUrl()
        ? {
            webServiceURL: this.webServiceUrl(),
            authenticationToken: this.authToken(d.membershipId),
          }
        : {}),
    };

    if (d.stamps) {
      const left = d.stamps.target - d.stamps.collected;
      const noun = d.stamps.rewardName ?? 'visit';
      return {
        ...common,
        storeCard: {
          headerFields: [
            {
              key: 'progress',
              label: 'Collected',
              value: `${d.stamps.collected} of ${d.stamps.target}`,
            },
          ],
          // The design states the remainder as a sentence rather than a pair of
          // statistics: "3 more coffees" over "for a free coffee".
          primaryFields: [
            {
              key: 'remaining',
              label: left > 0 ? `for a free ${noun}` : 'Show this at the counter',
              value: left > 0 ? `${left} more ${plural(noun, left)}` : `Free ${noun} ready`,
            },
          ],
          secondaryFields: [
            ...(d.memberName ? [{ key: 'member', label: 'Member', value: d.memberName }] : []),
            { key: 'card', label: 'Card', value: d.loyaltyId },
          ],
          backFields: [
            {
              key: 'howto',
              label: 'How to collect',
              value: 'Scan at the counter to add a stamp.',
            },
            { key: 'balance', label: d.pointsCode, value: this.grouped(d.balance) },
          ],
        },
      };
    }

    return {
      ...common,
      storeCard: {
        headerFields: [{ key: 'points', label: d.pointsCode, value: this.grouped(d.balance) }],
        primaryFields: [{ key: 'balance', label: 'Points', value: this.grouped(d.balance) }],
        secondaryFields: [
          ...(d.tier ? [{ key: 'tier', label: 'Tier', value: d.tier }] : []),
          ...(d.memberName ? [{ key: 'member', label: 'Member', value: d.memberName }] : []),
          { key: 'since', label: 'Since', value: d.memberSince },
        ],
        backFields: [
          { key: 'card', label: 'Card', value: d.loyaltyId },
          { key: 'howto', label: 'How to use', value: 'Show this code at the till to earn and redeem.' },
          { key: 'site', label: 'Partners Points', value: d.siteUrl },
        ],
      },
    };
  }

  /**
   * Where the device goes to ask about updates.
   *
   * PUBLIC_API_URL already carries the /v1 prefix, and Apple's protocol also
   * expects a /v1 segment — the same one, by coincidence rather than design.
   */
  private webServiceUrl(): string | null {
    const base = this.config.get<string>('PUBLIC_API_URL') ?? 'https://api.partnerspoints.ae/v1';
    // Only advertise it once pushes can actually be sent; otherwise the device
    // polls a service that will never tell it anything changed.
    return this.config.get<string>('APPLE_APNS_KEY_P8') ? base : null;
  }

  /**
   * Derived the same way PassKitService derives it — the two must agree, since
   * one writes the token into the pass and the other checks what comes back.
   */
  private authToken(serialNumber: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_ACCESS_SECRET'))
      .update(`pass:${serialNumber}`)
      .digest('hex');
  }

  private grouped(balance: string): string {
    // The balance is a 64-bit string; formatting it as a Number would lose
    // precision at the top end, so group the digits directly.
    return balance.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * Build and sign the `.pkpass`.
   *
   * Returns null when unconfigured so callers can present the pass button only
   * where it will actually work.
   */
  async issue(d: PassData, images: Record<string, Buffer>): Promise<Buffer | null> {
    if (!this.configured) {
      this.logger.warn('Apple Wallet not configured — no pass issued');
      return null;
    }

    const files: Record<string, Buffer> = {
      'pass.json': Buffer.from(JSON.stringify(this.passJson(d))),
      ...images,
    };

    // The manifest is SHA-1 per Apple's spec. That is not a security choice we
    // get to make — the signature over the manifest is what carries the trust.
    const manifest: Record<string, string> = {};
    for (const [name, buf] of Object.entries(files)) {
      manifest[name] = createHash('sha1').update(buf).digest('hex');
    }
    const manifestBuf = Buffer.from(JSON.stringify(manifest));

    const zip = new JSZip();
    for (const [name, buf] of Object.entries(files)) zip.file(name, buf);
    zip.file('manifest.json', manifestBuf);
    zip.file('signature', this.sign(manifestBuf));

    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  /** Detached PKCS#7 signature over the manifest, DER encoded. */
  private sign(manifest: Buffer): Buffer {
    const p12Der = forge.util.decode64(this.config.getOrThrow<string>('APPLE_PASS_CERT_P12'));
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(
      p12Asn1,
      this.config.get<string>('APPLE_PASS_CERT_PASSWORD') ?? '',
    );

    const certBags = p12.getBags({ bagType: OID.certBag })[OID.certBag] ?? [];
    const keyBags = p12.getBags({ bagType: OID.pkcs8ShroudedKeyBag })[OID.pkcs8ShroudedKeyBag] ?? [];

    const key = keyBags[0]?.key as forge.pki.rsa.PrivateKey | undefined;
    if (!key) throw new Error('APPLE_PASS_CERT_P12 contains no private key');

    // A .p12 often carries the intermediate alongside the leaf. The leaf is the
    // one whose public key matches the private key we just pulled out; picking
    // the first certificate instead produces a pass Apple rejects with no
    // useful diagnostic.
    const leaf =
      certBags
        .map((b) => b.cert)
        .find((c) => c && (c.publicKey as forge.pki.rsa.PublicKey).n?.toString(16) === key.n?.toString(16)) ??
      certBags[0]?.cert;
    if (!leaf) throw new Error('APPLE_PASS_CERT_P12 contains no certificate');

    const wwdr = forge.pki.certificateFromPem(
      this.config.getOrThrow<string>('APPLE_WWDR_CERT_PEM'),
    );

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(manifest.toString('binary'));
    p7.addCertificate(leaf);
    p7.addCertificate(wwdr);
    p7.addSigner({
      key,
      certificate: leaf,
      digestAlgorithm: OID.sha256,
      authenticatedAttributes: [
        { type: OID.contentType, value: OID.data },
        { type: OID.messageDigest },
        { type: OID.signingTime },
      ],
    });
    // Detached: the manifest travels as its own file in the zip, so the
    // signature must not repeat it.
    p7.sign({ detached: true });

    return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
  }
}
