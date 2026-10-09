// ============================================================================
// FILE: /apps/api/src/modules/blue-ocean/engine/blue-ocean.ts
// ============================================================================
// Pure blue-ocean detector. No database, no clock, no network — the caller
// hands in demand and competition scores and this file says which waters are
// actually worth fishing. Every verdict quotes its numbers, because a
// verdict without arithmetic is just a mood.

export type OceanVerdict = 'blue_ocean' | 'open_niche' | 'contested' | 'red_ocean';

export interface OceanCandidate {
  id: string;
  title: string;
  demand: number;        // 0-100, higher = more people want it
  competition: number;   // 0-100, higher = more people already serve it
  category: string;
}

export interface OceanReading {
  id: string;
  title: string;
  category: string;
  demand: number;
  competition: number;
  gap: number;          // demand minus competition, -100..100
  verdict: OceanVerdict;
  reasons: string[];
}

export interface OceanReport {
  ranked: OceanReading[];
  counts: Record<OceanVerdict, number>;
  blueOceanCount: number;
}

// A blue ocean needs real demand AND real emptiness: demand at or above 60
// with competition at or below 35. Below that bar, the gap decides — an
// open niche leads demand by 20 points, contested water is anything within
// 10 points either way, and anything where the crowd outnumbers the demand
// by 10 or more is red.
const BLUE_DEMAND_FLOOR = 60;
const BLUE_COMPETITION_CEILING = 35;
const OPEN_NICHE_GAP = 20;
const RED_OCEAN_GAP = -10;

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function readOcean(candidate: OceanCandidate): OceanReading {
  const demand = clamp(candidate.demand);
  const competition = clamp(candidate.competition);
  const gap = Math.round((demand - competition) * 10) / 10;

  let verdict: OceanVerdict;
  const reasons: string[] = [];

  if (demand >= BLUE_DEMAND_FLOOR && competition <= BLUE_COMPETITION_CEILING) {
    verdict = 'blue_ocean';
    reasons.push(
      'demand ' + demand + ' clears the ' + BLUE_DEMAND_FLOOR + ' floor while competition ' +
        competition + ' stays under the ' + BLUE_COMPETITION_CEILING + ' ceiling',
    );
  } else if (gap >= OPEN_NICHE_GAP) {
    verdict = 'open_niche';
    reasons.push('demand leads competition by ' + gap + ' points');
    if (demand < BLUE_DEMAND_FLOOR) {
      reasons.push('demand ' + demand + ' is below the blue-ocean floor of ' + BLUE_DEMAND_FLOOR + ' — promising shape, thin crowd, but not proven pull yet');
    }
  } else if (gap < RED_OCEAN_GAP) {
    verdict = 'red_ocean';
    reasons.push('competition outnumbers demand by ' + Math.abs(gap) + ' points — the water is already crowded');
  } else {
    verdict = 'contested';
    reasons.push('demand ' + demand + ' and competition ' + competition + ' are within 10 points of each other — no clear water either way');
  }

  return {
    id: candidate.id,
    title: candidate.title,
    category: candidate.category,
    demand,
    competition,
    gap,
    verdict,
    reasons,
  };
}

export function rankOceans(candidates: OceanCandidate[]): OceanReport {
  const readings = candidates.map(readOcean);
  // Biggest gap first; ties broken alphabetically by title for stability.
  readings.sort((a, b) => {
    if (b.gap !== a.gap) return b.gap - a.gap;
    return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
  });

  const counts: Record<OceanVerdict, number> = {
    blue_ocean: 0,
    open_niche: 0,
    contested: 0,
    red_ocean: 0,
  };
  for (const reading of readings) counts[reading.verdict]++;

  return { ranked: readings, counts, blueOceanCount: counts.blue_ocean };
}
