/**
 * Fraud, in plain language — platform operator edition.
 *
 * The API speaks in rule keys, metric values and thresholds. The operator should
 * read a case as a sentence, not decode it. This turns a case into something a
 * person understands, and each protection into a one-line promise of what it
 * watches for. No rule keys, no UUIDs, no "metric vs threshold" in the copy.
 */
import type { FraudAlertRow, FraudAlertStatus } from '@/lib/api';

export interface RuleCopy {
  /** Short human name for the protection. */
  label: string;
  /** What it watches for, one line. */
  watches: string;
}

export const RULE_COPY: Record<string, RuleCopy> = {
  member_velocity_daily: {
    label: 'Too many earns on one account',
    watches: 'One customer earning points on far more purchases in a day than a real shopper would.',
  },
  member_points_daily: {
    label: 'Too many points in a day',
    watches: 'One customer collecting more points in a day than genuine spending would give.',
  },
  terminal_self_earn: {
    label: 'A till earning on one number',
    watches: 'A till crediting the same customer again and again — the usual sign of a cashier earning on their own card.',
  },
  referral_burst: {
    label: 'Referral reward abuse',
    watches: 'One customer claiming far more referral rewards than real word-of-mouth would bring.',
  },
};

export function ruleCopy(key: string): RuleCopy {
  return RULE_COPY[key] ?? { label: key.replace(/_/g, ' '), watches: 'An unusual pattern worth a look.' };
}

/** Who/what a case is about — never a raw id. */
export function subjectLabel(a: FraudAlertRow): string {
  if (a.ruleKey === 'terminal_self_earn') return 'A till and one customer';
  if (a.subjectType === 'terminal') return 'A till';
  if (a.subjectType === 'membership') return 'A customer';
  if (a.subjectType === 'branch') return 'A branch';
  return 'A customer';
}

/** A one-sentence, human explanation of what was seen. No ids, no "metric vs threshold". */
export function describeAlert(a: FraudAlertRow): string {
  const n = Number(a.metricValue);
  const t = Number(a.thresholdValue);
  switch (a.ruleKey) {
    case 'member_velocity_daily':
      return `One customer earned points on ${n} separate purchases in a day — the limit is ${t}. Often a card being reused, or a till scanning the same number.`;
    case 'member_points_daily':
      return `One customer collected ${n.toLocaleString()} points in a day — above the limit of ${t.toLocaleString()}. Worth checking the sales behind it are real.`;
    case 'terminal_self_earn':
      return `One till credited the same customer ${n} times in a day — the limit is ${t}. This is the classic sign of a cashier earning on their own number.`;
    case 'referral_burst':
      return `One customer claimed ${n} referral rewards in a day — above the limit of ${t}. Could be invented referrals.`;
    default:
      return `An unusual pattern: ${n} against a limit of ${t}.`;
  }
}

export const STATUS_COPY: Record<FraudAlertStatus, { label: string; tone: 'coral' | 'lime' | 'teal' | 'neutral' }> = {
  open: { label: 'Needs a look', tone: 'coral' },
  acknowledged: { label: 'Seen', tone: 'neutral' },
  review_requested: { label: 'Review requested', tone: 'teal' },
  resolved: { label: 'Resolved', tone: 'lime' },
  dismissed: { label: 'Cleared', tone: 'neutral' },
};

export const SEVERITY_COPY: Record<string, { label: string; tone: 'coral' | 'teal' | 'neutral' }> = {
  critical: { label: 'Urgent', tone: 'coral' },
  high: { label: 'High', tone: 'coral' },
  medium: { label: 'Medium', tone: 'neutral' },
  low: { label: 'Low', tone: 'teal' },
  info: { label: 'Info', tone: 'teal' },
};
