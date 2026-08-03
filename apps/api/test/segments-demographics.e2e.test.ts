/**
 * Demographic targeting.
 *
 * The schema always described gender and birthdate as "stored queryable so they
 * can drive segments", but nothing joined `person`, so no demographic was
 * reachable by any rule. These tests cover the join, and the null semantics that
 * decide who a negative rule includes — the question a brand gets wrong at their
 * customers' expense if we guess it for them.
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@rfm-loyalty/db';
import type { TenantContext } from '@rfm-loyalty/shared';
import { inject } from 'vitest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SegmentService, type SegmentDefinition } from '../src/modules/segments/segment.service';
import { AuditService } from '../src/platform-core/audit/audit.service';
import { TenantService } from '../src/platform-core/tenancy/tenant.service';

describe('Segment demographics', () => {
  let prisma: PrismaClient;
  let segments: SegmentService;

  const platformId = randomUUID();
  const groupId = randomUUID();
  const brandId = randomUUID();

  const ctx: TenantContext = {
    platformId, groupId, brandId, branchId: null, scopeLevel: 'brand', surface: 'brand_admin',
    actor: { type: 'user', id: randomUUID(), onBehalfOf: null },
  };

  /** Loyalty ids, so a matched set can be named rather than counted. */
  const ids: Record<string, string> = {};

  const member = async (
    key: string,
    person: { nationality?: string; gender?: string; birthdate?: Date },
  ) => {
    const p = await prisma.person.create({ data: { platformId, fullName: key, ...person } });
    const m = await prisma.customerMembership.create({
      data: { personId: p.id, brandId, groupId, platformId, loyaltyId: key },
    });
    ids[key] = m.id;
  };

  const matched = async (def: SegmentDefinition): Promise<string[]> => {
    const r = await segments.preview(ctx, def, 50);
    return (r.sample as Array<{ loyaltyId: string }>).map((s) => s.loyaltyId).sort();
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: inject('DATABASE_URL') });
    await prisma.$connect();
    segments = new SegmentService(new TenantService(prisma as never), new AuditService());

    await prisma.platform.create({ data: { id: platformId, name: 'S' } });
    await prisma.group.create({ data: { id: groupId, platformId, name: 'G' } });
    await prisma.brand.create({
      data: { id: brandId, groupId, platformId, name: 'Seg', slug: `s-${brandId.slice(0, 8)}` },
    });

    const yearsAgo = (n: number) => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - n);
      return d;
    };

    await member('AE-F-30', { nationality: 'AE', gender: 'female', birthdate: yearsAgo(30) });
    await member('IN-M-45', { nationality: 'IN', gender: 'male', birthdate: yearsAgo(45) });
    await member('GB-F-22', { nationality: 'GB', gender: 'female', birthdate: yearsAgo(22) });
    // The one who never filled anything in — the case that decides the semantics.
    await member('UNKNOWN', {});
    await member('MARCH', { nationality: 'AE', birthdate: new Date('1994-03-17') });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('filters by nationality', async () => {
    expect(await matched({ rules: [{ field: 'nationality', op: 'eq', value: 'AE' }] }))
      .toEqual(['AE-F-30', 'MARCH']);
  });

  it('accepts a lowercase code — codes are stored uppercase', async () => {
    expect(await matched({ rules: [{ field: 'nationality', op: 'eq', value: 'ae' }] }))
      .toEqual(['AE-F-30', 'MARCH']);
  });

  it('takes a list of nationalities', async () => {
    expect(await matched({ rules: [{ field: 'nationality', op: 'in', value: ['IN', 'GB'] }] }))
      .toEqual(['GB-F-22', 'IN-M-45']);
    // A comma-separated string is the shape a console form sends.
    expect(await matched({ rules: [{ field: 'nationality', op: 'in', value: 'IN,GB' }] }))
      .toEqual(['GB-F-22', 'IN-M-45']);
  });

  it('excludes people whose nationality is unknown from a negative rule', async () => {
    // "Not Emirati" must not quietly mean "or never told us". Someone who left
    // the field blank is unknown, not foreign.
    const out = await matched({ rules: [{ field: 'nationality', op: 'not_in', value: ['AE'] }] });
    expect(out).toEqual(['GB-F-22', 'IN-M-45']);
    expect(out).not.toContain('UNKNOWN');

    const neq = await matched({ rules: [{ field: 'nationality', op: 'neq', value: 'AE' }] });
    expect(neq).not.toContain('UNKNOWN');
  });

  it('can ask for the people who never said', async () => {
    expect(await matched({ rules: [{ field: 'nationality', op: 'is_not_set', value: '' }] }))
      .toEqual(['UNKNOWN']);
  });

  it('filters by age range', async () => {
    // AE-F-30 is 30; MARCH was born in 1994 and so is in their thirties too.
    // UNKNOWN has no birthdate and must not fall into a range.
    const out = await matched({
      match: 'all',
      rules: [
        { field: 'ageYears', op: 'gte', value: 25 },
        { field: 'ageYears', op: 'lte', value: 40 },
      ],
    });
    expect(out).toEqual(['AE-F-30', 'MARCH']);
    expect(out).not.toContain('UNKNOWN');
    expect(out).not.toContain('IN-M-45');
    expect(out).not.toContain('GB-F-22');
  });

  it('filters by birthday month, for birthday campaigns', async () => {
    expect(await matched({ rules: [{ field: 'birthMonth', op: 'eq', value: 3 }] }))
      .toEqual(['MARCH']);
  });

  it('filters by gender', async () => {
    expect(await matched({ rules: [{ field: 'gender', op: 'eq', value: 'female' }] }))
      .toEqual(['AE-F-30', 'GB-F-22']);
  });

  it('combines demographics with behaviour', async () => {
    // Both kinds of rule in one definition — the point of joining person at all.
    const out = await matched({
      match: 'all',
      rules: [
        { field: 'nationality', op: 'eq', value: 'AE' },
        { field: 'lifetime', op: 'gte', value: 0 },
      ],
    });
    expect(out).toEqual(['AE-F-30', 'MARCH']);
  });

  it('still evaluates behavioural rules unchanged', async () => {
    const all = await matched({ rules: [] });
    expect(all).toHaveLength(5);
    expect(await matched({ rules: [{ field: 'lifetime', op: 'gte', value: 1 }] })).toEqual([]);
  });

  it('rejects an unknown field rather than guessing', async () => {
    await expect(
      segments.preview(ctx, { rules: [{ field: 'salary' as never, op: 'gte', value: 1 }] }),
    ).rejects.toThrow();
  });

  it('publishes the fields the console builds rules from', () => {
    const fields = segments.fields();
    const nationality = fields.find((f) => f.key === 'nationality')!;
    expect(nationality.type).toBe('enum');
    // The console used to hardcode its own copy of this; serving it is what
    // stops the two drifting.
    expect(nationality.options!.length).toBeGreaterThan(200);
    expect(nationality.options!.some((o) => o.value === 'AE')).toBe(true);
    expect(nationality.ops).toContain('in');
  });
});
