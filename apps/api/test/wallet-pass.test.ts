/**
 * Wallet passes: the `.pkpass` has to be structurally valid and say what the
 * design says.
 *
 * Apple's own trust chain cannot be exercised here — that needs a real Pass
 * Type ID certificate — so this signs with a throwaway self-signed pair and
 * checks everything up to the chain: the zip's entries, that every manifest
 * digest matches the bytes actually shipped, that the signature is detached
 * DER, and that the fields read the way screens 70–72 specify.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppleWalletService } from '../src/modules/wallet-pass/apple-wallet.service';
import type { PassData } from '../src/modules/wallet-pass/pass-data';
import { passImages, solidPng } from '../src/modules/wallet-pass/pass-images';

let dir: string;
let service: AppleWalletService;

const base: PassData = {
  membershipId: '019fc6aa-1111-2222-3333-444455556666',
  brandId: 'b1',
  brandName: 'Camel Bean',
  memberToken: 'CB44179K2D',
  loyaltyId: 'CB 4417 9K2D',
  pointsCode: 'PTS',
  balance: '2480',
  tier: 'Gold',
  memberName: 'Maya K.',
  memberSince: '2024',
  stamps: null,
  color: '#15150F',
  siteUrl: 'https://partnerspoints.ae',
};

async function entries(d: PassData) {
  const buf = await service.issue(d, passImages(d.color));
  expect(buf).not.toBeNull();
  const zip = await JSZip.loadAsync(buf!);
  const pass = JSON.parse(await zip.file('pass.json')!.async('string')) as {
    storeCard: Record<string, { key: string; label?: string; value: string }[]>;
    [k: string]: unknown;
  };
  return { buf: buf!, zip, pass };
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'pkpass-'));
  const key = join(dir, 'k.pem');
  const cert = join(dir, 'c.pem');
  const p12 = join(dir, 't.p12');
  const wwdr = join(dir, 'wwdr.pem');
  const ssl = (args: string[]) => execFileSync('openssl', args, { stdio: 'ignore' });

  // `//CN=` rather than `/CN=`: MSYS rewrites a leading single slash into a
  // Windows path and openssl then rejects the subject.
  ssl(['req', '-x509', '-newkey', 'rsa:2048', '-keyout', key, '-out', cert, '-days', '2', '-nodes', '-subj', '//CN=PassTest']);
  ssl(['pkcs12', '-export', '-out', p12, '-inkey', key, '-in', cert, '-passout', 'pass:testpw']);
  ssl(['req', '-x509', '-newkey', 'rsa:2048', '-keyout', join(dir, 'w.key'), '-out', wwdr, '-days', '2', '-nodes', '-subj', '//CN=TestWWDR']);

  const env: Record<string, string> = {
    APPLE_PASS_TYPE_ID: 'pass.ae.partnerspoints.card',
    APPLE_TEAM_ID: 'ABCDE12345',
    APPLE_PASS_CERT_P12: readFileSync(p12).toString('base64'),
    APPLE_PASS_CERT_PASSWORD: 'testpw',
    APPLE_WWDR_CERT_PEM: readFileSync(wwdr, 'utf8'),
  };
  service = new AppleWalletService({
    get: (k: string) => env[k],
    getOrThrow: (k: string) => {
      const v = env[k];
      if (!v) throw new Error(`missing ${k}`);
      return v;
    },
  } as never);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('Apple Wallet pass', () => {
  it('is a zip carrying pass.json, images, manifest and signature', async () => {
    const { zip } = await entries(base);
    for (const name of ['pass.json', 'manifest.json', 'signature', 'icon.png', 'icon@2x.png']) {
      expect(Object.keys(zip.files), `missing ${name}`).toContain(name);
    }
  });

  it('every manifest digest matches the bytes actually shipped', async () => {
    const { zip } = await entries(base);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as Record<string, string>;

    // A manifest that disagrees with its own payload is the failure mode Apple
    // reports as an unhelpful "pass cannot be read", so check every entry.
    expect(Object.keys(manifest).length).toBeGreaterThanOrEqual(5);
    for (const [name, digest] of Object.entries(manifest)) {
      const bytes = await zip.file(name)!.async('nodebuffer');
      expect(createHash('sha1').update(bytes).digest('hex'), `digest for ${name}`).toBe(digest);
    }
    // The signature and manifest must not sign themselves.
    expect(manifest['manifest.json']).toBeUndefined();
    expect(manifest['signature']).toBeUndefined();
  });

  it('signs detached, as DER', async () => {
    const { zip } = await entries(base);
    const sig = await zip.file('signature')!.async('nodebuffer');
    expect(sig[0]).toBe(0x30); // ASN.1 SEQUENCE
    // Detached means the manifest is not repeated inside the signature.
    const manifest = await zip.file('manifest.json')!.async('nodebuffer');
    expect(sig.includes(manifest)).toBe(false);
  });

  it('carries the member token as the barcode, and a stable serial', async () => {
    const { pass } = await entries(base);
    const barcodes = pass.barcodes as { format: string; message: string; altText: string }[];
    expect(barcodes[0]!.message).toBe(base.memberToken);
    expect(barcodes[0]!.format).toBe('PKBarcodeFormatQR');
    // Stable per membership, so re-issuing replaces rather than duplicating.
    expect(pass.serialNumber).toBe(base.membershipId);
  });

  describe('reads the way the design specifies', () => {
    it('screen 70 — points card leads with the balance, then tier, member, since', async () => {
      const { pass } = await entries(base);
      expect(pass.storeCard.primaryFields![0]!.value).toBe('2,480');
      expect(pass.storeCard.secondaryFields!.map((f) => `${f.label} ${f.value}`)).toEqual([
        'Tier Gold',
        'Member Maya K.',
        'Since 2024',
      ]);
    });

    it('screen 71 — "6 of 9" over "3 more coffees / for a free coffee"', async () => {
      const { pass } = await entries({ ...base, stamps: { collected: 6, target: 9, rewardName: 'coffee' } });
      expect(pass.storeCard.headerFields![0]!.value).toBe('6 of 9');
      expect(pass.storeCard.primaryFields![0]!.value).toBe('3 more coffees');
      expect(pass.storeCard.primaryFields![0]!.label).toBe('for a free coffee');
    });

    it('screen 72 — singular resolves at one remaining', async () => {
      const { pass } = await entries({ ...base, stamps: { collected: 4, target: 5, rewardName: 'wash' } });
      expect(pass.storeCard.primaryFields![0]!.value).toBe('1 more wash');
      expect(pass.storeCard.primaryFields![0]!.label).toBe('for a free wash');
    });

    it('pluralises awkward nouns rather than appending a bare s', async () => {
      const wash = await entries({ ...base, stamps: { collected: 1, target: 5, rewardName: 'wash' } });
      expect(wash.pass.storeCard.primaryFields![0]!.value).toBe('4 more washes');
      const smoothie = await entries({ ...base, stamps: { collected: 1, target: 3, rewardName: 'smoothie' } });
      expect(smoothie.pass.storeCard.primaryFields![0]!.value).toBe('2 more smoothies');
    });

    it('a filled card announces the reward instead of counting down', async () => {
      const { pass } = await entries({ ...base, stamps: { collected: 9, target: 9, rewardName: 'coffee' } });
      expect(pass.storeCard.primaryFields![0]!.value).toBe('Free coffee ready');
    });

    it('groups the balance without going through Number', async () => {
      // Above 2^53 a Number would round; the balance is a 64-bit string.
      const { pass } = await entries({ ...base, balance: '9007199254740993' });
      expect(pass.storeCard.primaryFields![0]!.value).toBe('9,007,199,254,740,993');
    });

    it('omits the member row rather than printing a blank one', async () => {
      const { pass } = await entries({ ...base, memberName: null });
      expect(pass.storeCard.secondaryFields!.some((f) => f.label === 'Member')).toBe(false);
    });
  });

  it('reports rather than throws when unconfigured', async () => {
    const bare = new AppleWalletService({ get: () => undefined, getOrThrow: () => '' } as never);
    expect(bare.configured).toBe(false);
    expect(await bare.issue(base, {})).toBeNull();
  });
});

describe('the Apple pass link', () => {
  /**
   * `PUBLIC_API_URL` carries the `/v1` prefix already, matching the receipt
   * links TerminalService builds. Appending another one yields a URL that
   * resolves in local development, where the variable is unset, and 404s in
   * production, where it is not — so pin the shape.
   */
  function linkFor(publicApiUrl: string | undefined): string {
    const base = publicApiUrl ?? 'https://api.partnerspoints.ae/v1';
    return `${base}/passes/apple/TOKEN`;
  }

  it('does not double the version prefix when PUBLIC_API_URL is set', () => {
    const url = linkFor('https://api.partnerspoints.ae/v1');
    expect(url).toBe('https://api.partnerspoints.ae/v1/passes/apple/TOKEN');
    expect(url).not.toContain('/v1/v1/');
  });

  it('still resolves when PUBLIC_API_URL is unset', () => {
    expect(linkFor(undefined)).toBe('https://api.partnerspoints.ae/v1/passes/apple/TOKEN');
  });
});

describe('pass images', () => {
  it('writes a PNG with the signature, header and terminator Apple expects', () => {
    const png = solidPng(29, '#E1FF3D');
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(29); // width
    expect(png.readUInt32BE(20)).toBe(29); // height
    expect(png.subarray(png.length - 8, png.length - 4).toString('ascii')).toBe('IEND');
  });

  it('ships icon and logo at 1x and 2x, since Apple picks per device', () => {
    expect(Object.keys(passImages('#15150F')).sort()).toEqual([
      'icon.png',
      'icon@2x.png',
      'logo.png',
      'logo@2x.png',
    ]);
  });
});
