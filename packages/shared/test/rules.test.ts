import { describe, expect, it } from 'vitest';
import {
  type EarnRule,
  type EarnContext,
  evaluateCondition,
  evaluateEarn,
} from '../src/rules';

describe('condition evaluation', () => {
  const ctx = {
    session: { amountMinor: 10000, channel: 'in_store' },
    profile: { tier: 'gold' },
    items: [{ sku: 'COFFEE', qty: 2 }],
  };

  it('handles leaf operators', () => {
    expect(evaluateCondition({ attr: 'session.amountMinor', op: 'gte', value: 5000 }, ctx)).toBe(true);
    expect(evaluateCondition({ attr: 'profile.tier', op: 'eq', value: 'gold' }, ctx)).toBe(true);
    expect(evaluateCondition({ attr: 'session.channel', op: 'in', value: ['online', 'in_store'] }, ctx)).toBe(true);
    expect(evaluateCondition({ attr: 'profile.tier', op: 'eq', value: 'silver' }, ctx)).toBe(false);
  });

  it('handles AND / OR / NOT nesting', () => {
    const cond = {
      all: [
        { attr: 'session.amountMinor', op: 'gte' as const, value: 5000 },
        { any: [{ attr: 'profile.tier', op: 'eq' as const, value: 'gold' }, { attr: 'profile.tier', op: 'eq' as const, value: 'platinum' }] },
        { not: { attr: 'session.channel', op: 'eq' as const, value: 'online' } },
      ],
    };
    expect(evaluateCondition(cond, ctx)).toBe(true);
  });

  it('undefined condition always matches; missing attrs are falsy', () => {
    expect(evaluateCondition(undefined, ctx)).toBe(true);
    expect(evaluateCondition({ attr: 'profile.missing', op: 'eq', value: 1 }, ctx)).toBe(false);
  });
});

describe('earn evaluation', () => {
  const base: EarnContext = { session: { amountMinor: 10000, isVisit: true, channel: 'in_store' }, profile: { tier: 'gold' }, items: [{ sku: 'COFFEE', qty: 2 }] };

  it('awards points per amount (1 pt / AED) + per visit', () => {
    const rules: EarnRule[] = [
      { id: 'r1', name: 'base', priority: 0, enabled: true, actions: [{ type: 'perAmount', pointsPerUnit: 1, unitMinor: 100 }] },
      { id: 'r2', name: 'visit', priority: 1, enabled: true, actions: [{ type: 'perVisit', points: 5 }] },
    ];
    const d = evaluateEarn(rules, base);
    expect(d.base).toBe(105); // 10000/100*1 + 5
    expect(d.points).toBe(105);
  });

  it('applies a conditional tier multiplier and respects a cap', () => {
    const rules: EarnRule[] = [
      { id: 'r1', name: 'base', priority: 0, enabled: true, actions: [{ type: 'perAmount', pointsPerUnit: 1, unitMinor: 100 }] },
      { id: 'r2', name: 'gold 2x', priority: 1, enabled: true, condition: { attr: 'profile.tier', op: 'eq', value: 'gold' }, actions: [{ type: 'multiplier', factor: 2 }] },
      { id: 'r3', name: 'cap', priority: 2, enabled: true, actions: [{ type: 'cap', maxPoints: 150 }] },
    ];
    const d = evaluateEarn(rules, base);
    expect(d.base).toBe(100);
    expect(d.multiplier).toBe(2);
    expect(d.cappedAt).toBe(150); // 200 capped to 150
    expect(d.points).toBe(150);
    expect(d.effects).toEqual([{ type: 'addPoints', points: 150, pointState: 'active' }]);
  });

  it('per-SKU rule only fires when the SKU is present', () => {
    const rules: EarnRule[] = [
      { id: 'r1', name: 'coffee bonus', priority: 0, enabled: true, actions: [{ type: 'perSku', sku: 'COFFEE', points: 10 }] },
      { id: 'r2', name: 'tea bonus', priority: 0, enabled: true, actions: [{ type: 'perSku', sku: 'TEA', points: 10 }] },
    ];
    const d = evaluateEarn(rules, base);
    expect(d.points).toBe(20); // 2 x COFFEE * 10; no TEA
  });

  it('disabled rules and non-matching conditions are skipped', () => {
    const rules: EarnRule[] = [
      { id: 'r1', name: 'off', priority: 0, enabled: false, actions: [{ type: 'bonus', points: 999 }] },
      { id: 'r2', name: 'online only', priority: 0, enabled: true, condition: { attr: 'session.channel', op: 'eq', value: 'online' }, actions: [{ type: 'bonus', points: 50 }] },
    ];
    const d = evaluateEarn(rules, base);
    expect(d.points).toBe(0);
    expect(d.matchedRuleIds).toEqual([]);
  });
});
