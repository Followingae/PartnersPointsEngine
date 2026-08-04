/**
 * What each RFM segment means, in words a shop owner can act on.
 *
 * The API returns a bare key — `cant_lose`, `potential_loyalist` — which is
 * jargon that tells a merchant nothing and, rendered with the underscores
 * swapped for spaces, reads like a bug. The label is only worth showing if the
 * reason behind it is one hover away.
 *
 * `rule` is the actual condition from `rfmSegment()` in the API's reporting
 * service, written out. If those thresholds change, these change with them.
 */
export interface SegmentInfo {
  label: string;
  tone: 'lime' | 'coral' | 'teal' | 'neutral';
  /** One line, for the hover. */
  short: string;
  /** The fuller explanation in the dialog. */
  meaning: string;
  /** The scoring rule, so the number in the R/F/M column is explicable. */
  rule: string;
  /** What to actually do about it — the only reason a segment is useful. */
  action: string;
}

export const SEGMENTS: Record<string, SegmentInfo> = {
  champions: {
    label: 'Champions',
    tone: 'lime',
    short: 'Recent, frequent, and spending the most.',
    meaning:
      'Your best customers. They came recently, they come often, and they spend more than almost everyone else.',
    rule: 'Recency, frequency and spend all in the top 40%.',
    action:
      'Protect them. Early access, a birthday reward, or simply being recognised by name at the till does more here than a discount.',
  },
  loyal: {
    label: 'Loyal',
    tone: 'lime',
    short: 'Come often and spend well, if not lately.',
    meaning:
      'A dependable habit. They visit frequently and spend above average — their last visit just may not be as recent as a champion’s.',
    rule: 'Frequency in the top 40% and spend in the top 60%.',
    action: 'Worth a reason to come back a little sooner. A stamp card suits this group well.',
  },
  new: {
    label: 'New',
    tone: 'teal',
    short: 'Arrived recently, no habit yet.',
    meaning:
      'They found you recently but have only been in once or twice. Whether they become regulars is mostly decided in the next few weeks.',
    rule: 'Recency in the top 40%, frequency in the bottom 40%.',
    action:
      'Give them a reason for a second visit while you are still fresh in mind — that is the visit that makes a regular.',
  },
  potential_loyalist: {
    label: 'Potential loyalist',
    tone: 'teal',
    short: 'Coming back, and starting to spend.',
    meaning:
      'Fairly recent, and showing either the frequency or the spend of a regular. On the way to loyal if nothing interrupts it.',
    rule: 'Recency in the top 60%, with frequency or spend in the top 60%.',
    action: 'A small nudge converts these. They are the cheapest group to move up.',
  },
  at_risk: {
    label: 'At risk',
    tone: 'coral',
    short: 'Used to come often. Not lately.',
    meaning:
      'They built a habit and then stopped. The drop is recent enough that they probably have not replaced you yet.',
    rule: 'Frequency in the top 60%, recency in the bottom 40%.',
    action: 'Reach out now. A win-back is far cheaper than finding someone new — and this is the window.',
  },
  cant_lose: {
    label: 'Can’t lose them',
    tone: 'coral',
    short: 'Big spenders who have gone quiet.',
    meaning:
      'They spent more than most and have not been seen in a while. The most expensive customers to lose, and the ones most worth a personal approach.',
    rule: 'Spend in the top 60%, with both recency and frequency in the bottom 40%.',
    action: 'Worth a phone call rather than a campaign. Find out what changed.',
  },
  hibernating: {
    label: 'Hibernating',
    tone: 'neutral',
    short: 'Not seen in a long time.',
    meaning: 'Long gone, and without the spend history that would justify chasing hard.',
    rule: 'Recency in the bottom 40%, and nothing else standing out.',
    action:
      'Low priority. Fine to include in a broad campaign; not worth spending real money on individually.',
  },
  regular: {
    label: 'Regular',
    tone: 'neutral',
    short: 'Nothing unusual in either direction.',
    meaning:
      'The middle of your customer base. Not slipping away, not standing out — which is most people, and is fine.',
    rule: 'Everyone the other rules do not describe.',
    action: 'No action needed. Watch for movement into “at risk” rather than acting now.',
  },
};

/** Unknown keys still render as something readable rather than raw. */
export function segmentInfo(key: string): SegmentInfo {
  return (
    SEGMENTS[key] ?? {
      label: key.replace(/_/g, ' '),
      tone: 'neutral',
      short: 'No description for this segment.',
      meaning: 'This segment was added to the API without a description here.',
      rule: '—',
      action: '—',
    }
  );
}

/**
 * Below this, the labels are ranking noise rather than behaviour.
 *
 * R, F and M are quintiles — each customer is scored against the others, not
 * against a fixed bar. With a handful of members somebody is in the top fifth
 * by arithmetic alone, so "champions" can mean "best of five". Saying so is
 * better than letting a merchant act on it.
 */
export const MEANINGFUL_SAMPLE = 20;
