/**
 * Fraud-detection rule catalogue + platform default thresholds.
 *
 * A brand may override any threshold (a `fraud_rule` row); where it has not, the
 * default here applies. Keeping defaults in code means every brand is protected
 * from day one without a seeding step, and the catalogue is the single source of
 * truth for which rules exist.
 */
export type FraudSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FraudAction = 'alert' | 'flag' | 'block';

export interface FraudRuleDef {
  key: string;
  title: string;
  description: string;
  subjectType: 'membership' | 'terminal' | 'person' | 'branch';
  thresholdNum: bigint;
  windowSeconds: number;
  severity: FraudSeverity;
  action: FraudAction;
}

export const FRAUD_RULES: Record<string, FraudRuleDef> = {
  member_velocity_daily: {
    key: 'member_velocity_daily',
    title: 'Member earning too often',
    description: 'A single membership earns on more transactions than a genuine customer plausibly would in a day.',
    subjectType: 'membership',
    thresholdNum: 15n,
    windowSeconds: 86_400,
    severity: 'medium',
    action: 'alert',
  },
  member_points_daily: {
    key: 'member_points_daily',
    title: 'Member accruing too many points',
    description: 'A single membership accrues more points in a day than the brand would expect from real spend.',
    subjectType: 'membership',
    thresholdNum: 50_000n,
    windowSeconds: 86_400,
    severity: 'high',
    action: 'alert',
  },
  terminal_self_earn: {
    key: 'terminal_self_earn',
    title: 'Cashier farming one number',
    description: 'One terminal repeatedly credits the SAME membership — the classic pattern of a cashier earning on their own number.',
    subjectType: 'terminal',
    thresholdNum: 5n,
    windowSeconds: 86_400,
    severity: 'high',
    action: 'alert',
  },
  referral_burst: {
    key: 'referral_burst',
    title: 'Referral reward burst',
    description: 'A member is collecting referral rewards faster than organic growth would produce.',
    subjectType: 'membership',
    thresholdNum: 10n,
    windowSeconds: 86_400,
    severity: 'medium',
    action: 'alert',
  },
};

export const FRAUD_RULE_KEYS = Object.keys(FRAUD_RULES);
