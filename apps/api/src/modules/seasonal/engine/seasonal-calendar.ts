// ============================================================================
// FILE: /apps/api/src/modules/seasonal/engine/seasonal-calendar.ts
// ============================================================================
// Pure seasonal calendar engine. No database, no clock, no network — the
// caller hands in 12 monthly demand indices and gets back the peaks, the
// troughs, the prep window (when to start building stock and content), and
// the trigger window (when demand actually fires). Fail-visible: bad input
// throws with a named reason instead of inventing a quiet little calendar.

export const MONTH_COUNT = 12;

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type SeasonProfile = 'strong' | 'moderate' | 'flat';

export interface SeasonalCalendar {
  months: number[];          // 12 normalized indices, 0-100
  peakMonths: number[];      // 0-11, within PEAK_BAND of the maximum
  troughMonths: number[];    // 0-11, within TROUGH_BAND of the minimum
  triggerMonths: number[];   // 0-11, demand at or above TRIGGER_SHARE of peak
  prepMonths: number[];      // 0-11, two months ahead of each trigger run
  strength: number;         // peak-to-trough spread, 0-100
  profile: SeasonProfile;
  reasons: string[];
}

// A month is a peak when it sits within 10 points of the year's maximum,
// a trough within 10 points of the minimum. Triggers fire at 75% of peak
// — the point where stock and content must already be live. Prep starts
// two months before that, because physical goods and course launches do
// not materialize overnight.
const PEAK_BAND = 10;
const TROUGH_BAND = 10;
const TRIGGER_SHARE = 0.75;
const PREP_LEAD_MONTHS = 2;
const STRONG_FLOOR = 50;
const MODERATE_FLOOR = 20;

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function buildCalendar(indices: number[]): SeasonalCalendar {
  if (!Array.isArray(indices) || indices.length !== MONTH_COUNT) {
    throw new Error(
      'Seasonal calendar needs exactly 12 monthly indices, got ' +
      (Array.isArray(indices) ? indices.length : 'none'),
    );
  }

  const raw = indices.map((v) => Number(v));
  for (let i = 0; i < raw.length; i++) {
    if (!Number.isFinite(raw[i])) {
      throw new Error('Monthly index for ' + MONTH_NAMES[i] + ' is not a finite number');
    }
  }

  // Scanners report both 0-1 ratios and 0-100 strengths. A year that never
  // exceeds 1 is read as a ratio and rescaled; anything larger is taken
  // as already on the 100 scale. All-zero input stays all-zero.
  const maxRaw = Math.max(...raw);
  const rescale = maxRaw > 0 && maxRaw <= 1 ? 100 : 1;
  const months = raw.map((v) => clamp(v * rescale));

  const max = Math.max(...months);
  const min = Math.min(...months);
  const strength = Math.round((max - min) * 100) / 100;

  const reasons: string[] = [];
  let peakMonths: number[] = [];
  let troughMonths: number[] = [];
  let triggerMonths: number[] = [];
  let prepMonths: number[] = [];

  if (max <= 0) {
    reasons.push('no measurable demand in any month — nothing to schedule around');
  } else if (strength < MODERATE_FLOOR) {
    reasons.push(
      'demand is nearly flat year-round (spread ' + strength + ' of 100) — no seasonal windows to auto-trigger',
    );
  } else {
    const peakFloor = max - PEAK_BAND;
    const troughCeiling = min + TROUGH_BAND;
    const triggerFloor = Math.max(TRIGGER_SHARE * max, max - 25);

    for (let i = 0; i < MONTH_COUNT; i++) {
      if (months[i] >= peakFloor) peakMonths.push(i);
      if (months[i] <= troughCeiling) troughMonths.push(i);
      if (months[i] >= triggerFloor) triggerMonths.push(i);
    }

    const prepSeen = new Set<number>();
    for (const trigger of triggerMonths) {
      prepSeen.add((trigger - PREP_LEAD_MONTHS + MONTH_COUNT) % MONTH_COUNT);
    }
    prepMonths = [...prepSeen].sort((a, b) => a - b);

    const peakNames = peakMonths.map((m) => MONTH_NAMES[m]).join(', ');
    reasons.push(peakMonths.length + ' peak month(s): ' + peakNames);
    reasons.push('peak-to-trough spread of ' + strength + ' out of 100');
    reasons.push(
      'prep should start in ' +
      prepMonths.map((m) => MONTH_NAMES[m]).join(', ') +
      ' (' + PREP_LEAD_MONTHS + ' months ahead of the trigger window)',
    );
  }

  let profile: SeasonProfile;
  if (max <= 0 || strength < MODERATE_FLOOR) {
    profile = 'flat';
  } else if (strength >= STRONG_FLOOR) {
    profile = 'strong';
  } else {
    profile = 'moderate';
  }

  return {
    months,
    peakMonths,
    troughMonths,
    triggerMonths,
    prepMonths,
    strength,
    profile,
    reasons,
  };
}
