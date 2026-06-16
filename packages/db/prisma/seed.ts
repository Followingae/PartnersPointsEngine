/**
 * Seed: one platform, two merchant groups (each with brands + branches),
 * built-in RBAC, demo admin users, and a couple of customers/terminals.
 * Idempotent — safe to re-run. Connects via DIRECT_URL as the owner role
 * (RLS bypassed for the owner; runtime uses the enforced `loyalty_app` role).
 */
import { createHash } from 'node:crypto';
import { hash as argonHash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { authorizeRedeem, captureRedeem, earnPoints } from '../src/ledger';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

const DEMO_PASSWORD = 'ChangeMe123!';
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

const PERMISSIONS = [
  'platform.manage',
  'platform.report.read',
  'group.manage',
  'group.wallet.manage',
  'brand.manage',
  'brand.campaign.write',
  'brand.customer.read',
  'brand.report.read',
  'branch.manage',
];

const ROLE_PERMS: Record<string, string[]> = {
  platform_superadmin: PERMISSIONS,
  platform_support: ['platform.report.read', 'group.manage', 'brand.manage'],
  group_admin: ['group.manage', 'group.wallet.manage', 'brand.manage', 'brand.report.read'],
  brand_admin: ['brand.manage', 'brand.campaign.write', 'brand.customer.read', 'brand.report.read'],
  branch_manager: ['branch.manage', 'brand.customer.read'],
  analyst_readonly: ['brand.report.read', 'platform.report.read'],
};

async function main() {
  const passwordHash = await argonHash(DEMO_PASSWORD);

  // ── Platform ──────────────────────────────────────────────────────────────
  const platform = await prisma.platform.upsert({
    where: { id: '00000000-0000-7000-8000-000000000001' },
    update: {},
    create: { id: '00000000-0000-7000-8000-000000000001', name: 'RFM Loyalty', region: 'uae' },
  });

  // ── Permissions & roles ─────────────────────────────────────────────────────
  const permByKey = new Map<string, string>();
  for (const key of PERMISSIONS) {
    const p = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: key },
    });
    permByKey.set(key, p.id);
  }

  const roleByKey = new Map<string, string>();
  for (const [key, perms] of Object.entries(ROLE_PERMS)) {
    const role = await prisma.role.upsert({
      where: { platformId_key: { platformId: platform.id, key } },
      update: {},
      create: {
        platformId: platform.id,
        key,
        name: key.replace(/_/g, ' '),
        isBuiltIn: true,
      },
    });
    roleByKey.set(key, role.id);
    for (const pk of perms) {
      const permissionId = permByKey.get(pk)!;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  // ── Helper to make an admin user with a role at a scope node ────────────────
  async function makeUser(email: string, fullName: string) {
    return prisma.userAccount.upsert({
      where: { platformId_emailLower: { platformId: platform.id, emailLower: email.toLowerCase() } },
      update: {},
      create: {
        platformId: platform.id,
        email,
        emailLower: email.toLowerCase(),
        passwordHash,
        fullName,
      },
    });
  }

  async function assign(
    userId: string,
    roleKey: string,
    scopeLevel: 'platform' | 'group' | 'brand' | 'branch',
    scopeId: string,
    ids: { groupId?: string; brandId?: string; branchId?: string },
  ) {
    const roleId = roleByKey.get(roleKey)!;
    await prisma.roleAssignment.upsert({
      where: { userId_roleId_scopeLevel_scopeId: { userId, roleId, scopeLevel, scopeId } },
      update: {},
      create: {
        userId,
        roleId,
        scopeLevel,
        scopeId,
        platformId: platform.id,
        groupId: ids.groupId ?? null,
        brandId: ids.brandId ?? null,
        branchId: ids.branchId ?? null,
      },
    });
  }

  // ── Superadmin ──────────────────────────────────────────────────────────────
  const superadmin = await makeUser('superadmin@rfm-loyalty.dev', 'RFM Superadmin');
  await assign(superadmin.id, 'platform_superadmin', 'platform', platform.id, {});

  // ── Two merchant groups, each with brands + branches ────────────────────────
  const groupsSpec = [
    {
      name: 'Roastery Holdings',
      brands: [
        { name: 'Camel Bean Coffee', slug: 'camel-bean', branches: ['Downtown Dubai', 'Marina'] },
        { name: 'Date & Co Bakery', slug: 'date-co', branches: ['JBR'] },
      ],
    },
    {
      name: 'Gulf Retail Co',
      brands: [{ name: 'Souk Mart', slug: 'souk-mart', branches: ['Deira', 'Sharjah'] }],
    },
  ];

  let personCounter = 0;
  for (const gspec of groupsSpec) {
    // No natural unique on group name → find-or-create (keeps seed idempotent).
    const group =
      (await prisma.group.findFirst({ where: { platformId: platform.id, name: gspec.name } })) ??
      (await prisma.group.create({
        data: { platformId: platform.id, name: gspec.name, homeRegion: 'uae', defaultCurrency: 'AED' },
      }));

    const groupAdmin = await makeUser(
      `admin@${sha256(gspec.name).slice(0, 6)}.dev`,
      `${gspec.name} Admin`,
    );
    await assign(groupAdmin.id, 'group_admin', 'group', group.id, { groupId: group.id });

    for (const bspec of gspec.brands) {
      const brand = await prisma.brand.upsert({
        where: { groupId_slug: { groupId: group.id, slug: bspec.slug } },
        update: {},
        create: {
          groupId: group.id,
          platformId: platform.id,
          name: bspec.name,
          slug: bspec.slug,
          currency: 'AED',
          pointsCurrencyCode: 'PTS',
          branding: { palette: 'lime', logo: null },
        },
      });

      const brandAdmin = await makeUser(`admin@${bspec.slug}.dev`, `${bspec.name} Admin`);
      await assign(brandAdmin.id, 'brand_admin', 'brand', brand.id, {
        groupId: group.id,
        brandId: brand.id,
      });

      for (const branchName of bspec.branches) {
        const branch =
          (await prisma.branch.findFirst({ where: { brandId: brand.id, name: branchName } })) ??
          (await prisma.branch.create({
            data: { brandId: brand.id, groupId: group.id, platformId: platform.id, name: branchName },
          }));

        // One terminal + api key per branch (first-party POS fleet).
        const existingTerminal = await prisma.terminal.findFirst({
          where: { branchId: branch.id, label: `${branchName} POS 1` },
        });
        const terminal =
          existingTerminal ??
          (await prisma.terminal.create({
            data: {
              branchId: branch.id,
              brandId: brand.id,
              groupId: group.id,
              platformId: platform.id,
              label: `${branchName} POS 1`,
              status: 'active',
              pairedAt: new Date(),
            },
          }));

        const pubId = `pk_${sha256(terminal.id).slice(0, 16)}`;
        const existingKey = await prisma.apiKey.findUnique({ where: { publishableId: pubId } });
        if (!existingKey) {
          await prisma.apiKey.create({
            data: {
              publishableId: pubId,
              secretHash: sha256(`secret:${terminal.id}`), // demo only
              status: 'active',
              platformId: platform.id,
              groupId: group.id,
              brandId: brand.id,
              branchId: branch.id,
              terminalId: terminal.id,
            },
          });
        }
      }

      // Two demo members per brand (global person + per-brand membership).
      for (let i = 0; i < 2; i++) {
        personCounter += 1;
        const phone = `+9715${String(personCounter).padStart(8, '0')}`;
        const phoneHash = sha256(phone);
        const person =
          (await prisma.person.findUnique({ where: { phoneHash } })) ??
          (await prisma.person.create({
            data: { platformId: platform.id, phoneHash, phoneEnc: Buffer.from(phone, 'utf8') },
          }));

        const loyaltyId = `${bspec.slug.toUpperCase().replace(/-/g, '')}-${String(personCounter).padStart(5, '0')}`;
        const membership = await prisma.customerMembership.upsert({
          where: { personId_brandId: { personId: person.id, brandId: brand.id } },
          update: {},
          create: {
            personId: person.id,
            brandId: brand.id,
            groupId: group.id,
            platformId: platform.id,
            loyaltyId,
          },
        });
        await prisma.customerIdentifier.upsert({
          where: { brandId_type_valueHash: { brandId: brand.id, type: 'phone', valueHash: phoneHash } },
          update: {},
          create: {
            membershipId: membership.id,
            brandId: brand.id,
            groupId: group.id,
            platformId: platform.id,
            type: 'phone',
            valueHash: phoneHash,
          },
        });
      }
    }
  }

  await seedDemoActivity();

  const counts = {
    platforms: await prisma.platform.count(),
    groups: await prisma.group.count(),
    brands: await prisma.brand.count(),
    branches: await prisma.branch.count(),
    users: await prisma.userAccount.count(),
    terminals: await prisma.terminal.count(),
    persons: await prisma.person.count(),
    memberships: await prisma.customerMembership.count(),
  };
  console.log('Seed complete:', counts);
  console.log(`Demo login password for all seeded admins: ${DEMO_PASSWORD}`);
}

/** Demo loyalty activity so the admin dashboards show real numbers/charts. */
async function seedDemoActivity() {
  const brands = await prisma.brand.findMany();
  const dayMs = 24 * 60 * 60 * 1000;
  for (const brand of brands) {
    const scopeIds = { brandId: brand.id, groupId: brand.groupId, platformId: brand.platformId };

    if (!(await prisma.loyaltyEarnRule.findFirst({ where: { brandId: brand.id } }))) {
      await prisma.loyaltyEarnRule.create({ data: { ...scopeIds, name: '1 pt / AED', definition: { actions: [{ type: 'perAmount', pointsPerUnit: 1, unitMinor: 100 }] } } });
    }
    if (!(await prisma.tier.findFirst({ where: { brandId: brand.id } }))) {
      await prisma.tier.createMany({
        data: [
          { ...scopeIds, name: 'Silver', threshold: 0n, sortOrder: 0 },
          { ...scopeIds, name: 'Gold', threshold: 500n, multiplierBps: 15000, sortOrder: 1 },
          { ...scopeIds, name: 'Platinum', threshold: 2000n, multiplierBps: 20000, sortOrder: 2 },
        ],
      });
    }
    if (!(await prisma.campaign.findFirst({ where: { brandId: brand.id } }))) {
      await prisma.campaign.create({ data: { ...scopeIds, name: 'Weekend Bonus', definition: { condition: { attr: 'session.amountMinor', op: 'gte', value: 5000 }, actions: [{ type: 'bonus', points: 25 }] } } });
    }
    if (!(await prisma.rewardCatalogItem.findFirst({ where: { brandId: brand.id } }))) {
      await prisma.rewardCatalogItem.createMany({
        data: [
          { ...scopeIds, name: 'Free Coffee', pointsCost: 200n },
          { ...scopeIds, name: 'AED 20 Voucher', pointsCost: 500n },
        ],
      });
    }

    const memberships = await prisma.customerMembership.findMany({ where: { brandId: brand.id } });
    let idx = 0;
    for (const m of memberships) {
      const cust = { ...scopeIds, customerId: m.id };
      for (let k = 0; k < 3; k++) {
        const points = BigInt((idx + 1) * 150 + k * 50);
        const occurredAt = new Date(Date.now() - (k * 9 + idx * 4) * dayMs);
        await prisma.$transaction((tx) =>
          earnPoints(tx, { scope: cust, points, occurredAt, idem: { actorId: 'seed', key: `seed-earn-${m.id}-${k}` }, expiryBucket: new Date(Date.now() + 365 * dayMs) }),
        );
      }
      if (idx % 2 === 0) {
        await prisma.$transaction(async (tx) => {
          await authorizeRedeem(tx, { scope: cust, points: 50n, occurredAt: new Date(), idem: { actorId: 'seed', key: `seed-ra-${m.id}` } });
          await captureRedeem(tx, { scope: cust, points: 50n, occurredAt: new Date(), idem: { actorId: 'seed', key: `seed-rc-${m.id}` } });
        });
      }
      idx += 1;
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
