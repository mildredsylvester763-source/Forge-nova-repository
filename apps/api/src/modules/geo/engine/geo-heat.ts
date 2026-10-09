// ============================================================================
// FILE: /apps/api/src/modules/geo/engine/geo-heat.ts
// ============================================================================
// Pure geographic demand heatmap engine. No database, no clock, no network —
// everything here is arithmetic over signals the caller has already loaded.
// Fail-visible: the caller counts shapes it could not parse and passes that
// count through; this engine never invents demand that was not reported.

export interface GeoSignal {
  region: string;
  strength: number;   // 0-100 demand strength for this region
  source: string;     // which opportunity (or scanner) reported it
}

export type GeoTier = 'hot' | 'warm' | 'cold';

export interface RegionHeat {
  region: string;
  heat: number;        // honest average of all signal strengths, 0-100
  sampleCount: number;
  tier: GeoTier;
  reasons: string[];
}

export interface GeoHeatmap {
  regions: RegionHeat[];
  totalSignals: number;
  unparsedCount: number;   // geographic payloads the caller could not read
}

// A region only counts as hot when demand is unambiguous, and only counts
// as warm once it is more than noise. Anything below is cold, and cold is
// still information — it says where NOT to spend first.
const HOT_FLOOR = 60;
const WARM_FLOOR = 35;

export function clampStrength(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function tierFor(heat: number): GeoTier {
  if (heat >= HOT_FLOOR) return 'hot';
  if (heat >= WARM_FLOOR) return 'warm';
  return 'cold';
}

export function buildHeatmap(signals: GeoSignal[], unparsedCount = 0): GeoHeatmap {
  // Group by region, keeping every signal so the heat is a real average —
  // one loud source must never masquerade as broad regional demand.
  const byRegion = new Map<string, number[]>();
  for (const signal of signals) {
    const region = (signal.region || '').trim();
    if (!region) continue;
    const strengths = byRegion.get(region);
    if (strengths) {
      strengths.push(clampStrength(signal.strength));
    } else {
      byRegion.set(region, [clampStrength(signal.strength)]);
    }
  }

  const regions: RegionHeat[] = [];
  for (const [region, strengths] of byRegion) {
    let sum = 0;
    for (const s of strengths) sum += s;
    const heat = sum / strengths.length;
    regions.push({
      region,
      heat: Math.round(heat * 100) / 100,
      sampleCount: strengths.length,
      tier: tierFor(heat),
      reasons: [
        strengths.length + ' demand signal(s) reported for this region',
        'average strength ' + Math.round(heat * 10) / 10 + ' out of 100',
      ],
    });
  }

  // Hottest region first; ties broken alphabetically so the same input
  // always renders the exact same map. No hidden sort instability.
  regions.sort((a, b) => {
    if (b.heat !== a.heat) return b.heat - a.heat;
    return a.region < b.region ? -1 : a.region > b.region ? 1 : 0;
  });

  return {
    regions,
    totalSignals: signals.length,
    unparsedCount: Math.max(0, unparsedCount),
  };
}
