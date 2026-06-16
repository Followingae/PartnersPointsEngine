import { z } from 'zod';

/**
 * Loyalty rules engine (pure decision → effects), Talon.One-style.
 *
 * A rule has a serializable CONDITION (a tree of AND/OR/NOT over typed, namespaced
 * attributes) and ACTIONS. Evaluation is a pure function of (rules, context) → a
 * deterministic, ORDER-INDEPENDENT set of effects. The engine never mutates state;
 * a separate apply step turns effects into ledger postings.
 */

// ── Conditions ────────────────────────────────────────────────────────────────

export const ComparisonOp = z.enum([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'nin',
  'contains',
  'startsWith',
  'endsWith',
  'matches',
]);
export type ComparisonOp = z.infer<typeof ComparisonOp>;

export interface Leaf {
  attr: string; // dotted path, e.g. 'session.amountMinor' | 'profile.tier' | 'item.sku'
  op: ComparisonOp;
  value?: unknown;
}

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | Leaf;

const LeafSchema: z.ZodType<Leaf> = z.object({
  attr: z.string().min(1),
  op: ComparisonOp,
  value: z.unknown(),
});

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(ConditionSchema) }),
    z.object({ any: z.array(ConditionSchema) }),
    z.object({ not: ConditionSchema }),
    LeafSchema,
  ]),
);

/** Resolve a dotted attribute path against the evaluation context. */
export function resolveAttr(ctx: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, ctx);
}

const MAX_REGEX_LEN = 200;

function applyOp(actual: unknown, op: ComparisonOp, value: unknown): boolean {
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v));
  switch (op) {
    case 'eq':
      return actual === value;
    case 'neq':
      return actual !== value;
    case 'gt':
      return num(actual) > num(value);
    case 'gte':
      return num(actual) >= num(value);
    case 'lt':
      return num(actual) < num(value);
    case 'lte':
      return num(actual) <= num(value);
    case 'in':
      return Array.isArray(value) && value.includes(actual);
    case 'nin':
      return Array.isArray(value) && !value.includes(actual);
    case 'contains':
      if (Array.isArray(actual)) return actual.includes(value);
      return typeof actual === 'string' && actual.includes(String(value));
    case 'startsWith':
      return typeof actual === 'string' && actual.startsWith(String(value));
    case 'endsWith':
      return typeof actual === 'string' && actual.endsWith(String(value));
    case 'matches': {
      const pattern = String(value);
      if (pattern.length > MAX_REGEX_LEN) return false; // bound evaluation cost
      try {
        return new RegExp(pattern).test(String(actual));
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

export function evaluateCondition(condition: Condition | undefined, ctx: unknown): boolean {
  if (!condition) return true; // no condition = always matches
  if ('all' in condition) return condition.all.every((c) => evaluateCondition(c, ctx));
  if ('any' in condition) return condition.any.some((c) => evaluateCondition(c, ctx));
  if ('not' in condition) return !evaluateCondition(condition.not, ctx);
  return applyOp(resolveAttr(ctx, condition.attr), condition.op, condition.value);
}

// ── Earn rules + actions ──────────────────────────────────────────────────────

export const EarnAction = z.discriminatedUnion('type', [
  // points per `unitMinor` of spend (e.g. 1 pt per 100 fils = 1 pt/AED)
  z.object({ type: z.literal('perAmount'), pointsPerUnit: z.number().nonnegative(), unitMinor: z.number().int().positive().default(100) }),
  z.object({ type: z.literal('perVisit'), points: z.number().int().nonnegative() }),
  z.object({ type: z.literal('perSku'), sku: z.string(), points: z.number().int().nonnegative() }),
  z.object({ type: z.literal('bonus'), points: z.number().int().nonnegative() }),
  z.object({ type: z.literal('multiplier'), factor: z.number().positive() }),
  z.object({ type: z.literal('cap'), maxPoints: z.number().int().positive() }),
]);
export type EarnAction = z.infer<typeof EarnAction>;

export const EarnRule = z.object({
  id: z.string(),
  name: z.string(),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
  // Loyalty TYPE this rule applies to. Omitted = applies to both online and in-store.
  channel: z.enum(['online', 'in_store']).optional(),
  condition: ConditionSchema.optional(),
  actions: z.array(EarnAction),
});
export type EarnRule = z.infer<typeof EarnRule>;

/** Evaluation context for an earn decision. */
export interface EarnContext {
  session: {
    amountMinor?: number;
    isVisit?: boolean;
    channel?: 'online' | 'in_store';
    [k: string]: unknown;
  };
  profile?: { tier?: string; [k: string]: unknown };
  items?: Array<{ sku: string; qty: number; [k: string]: unknown }>;
  event?: Record<string, unknown>;
}

export interface Effect {
  type: 'addPoints';
  points: number;
  pointState: 'pending' | 'active';
  reason?: string;
}

export interface EarnDecision {
  points: number;
  base: number;
  multiplier: number;
  cappedAt: number | null;
  matchedRuleIds: string[];
  effects: Effect[];
}

/** Pure: evaluate enabled rules against the context and decide points to award. */
export function evaluateEarn(rules: EarnRule[], ctx: EarnContext): EarnDecision {
  let base = 0;
  let multiplier = 1;
  let cap = Number.POSITIVE_INFINITY;
  const matchedRuleIds: string[] = [];

  for (const rule of [...rules].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority)) {
    // Type-scoped rules only fire on a matching channel; untyped rules apply to both.
    if (rule.channel && rule.channel !== ctx.session.channel) continue;
    if (!evaluateCondition(rule.condition, ctx)) continue;
    matchedRuleIds.push(rule.id);
    for (const action of rule.actions) {
      switch (action.type) {
        case 'perAmount':
          base += Math.floor((ctx.session.amountMinor ?? 0) / action.unitMinor) * action.pointsPerUnit;
          break;
        case 'perVisit':
          if (ctx.session.isVisit) base += action.points;
          break;
        case 'perSku': {
          const qty = (ctx.items ?? [])
            .filter((i) => i.sku === action.sku)
            .reduce((s, i) => s + (i.qty ?? 0), 0);
          base += qty * action.points;
          break;
        }
        case 'bonus':
          base += action.points;
          break;
        case 'multiplier':
          multiplier *= action.factor;
          break;
        case 'cap':
          cap = Math.min(cap, action.maxPoints);
          break;
      }
    }
  }

  const raw = Math.floor(base * multiplier);
  const capped = Number.isFinite(cap) ? Math.min(raw, cap) : raw;
  const points = Math.max(0, capped);

  return {
    points,
    base,
    multiplier,
    cappedAt: Number.isFinite(cap) && capped < raw ? cap : null,
    matchedRuleIds,
    effects: points > 0 ? [{ type: 'addPoints', points, pointState: 'active' }] : [],
  };
}
