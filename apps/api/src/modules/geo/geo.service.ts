// ============================================================================
// FILE: /apps/api/src/modules/geo/geo.service.ts
// ============================================================================
// Reads the user's opportunities and turns their geographicDemand payloads
// into signals for the pure heat engine. Tolerant on the way in — scanners
// have shipped more than one shape — but honest on the way out: anything it
// cannot read is counted in unparsedCount, never faked as zero demand.
// Zero-trust: every query is scoped by userId.

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { OpportunityCategory } from '../opportunities/enums';
import { buildHeatmap, GeoSignal } from './engine/geo-heat';

// The shapes seen in the wild so far: an array of region entries, or a
// straight record mapping region -> strength. Both are read; both count.
function extractSignals(opportunity: Opportunity): GeoSignal[] {
  const geo = opportunity.geographicDemand;
  if (!geo || typeof geo !== 'object') return [];

  const signals: GeoSignal[] = [];
  const source = 'opportunity ' + opportunity.id;

  if (Array.isArray(geo)) {
    for (const entry of geo) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, any>;
      const region =
        typeof record.region === 'string' ? record.region
        : typeof record.name === 'string' ? record.name
        : typeof record.country === 'string' ? record.country
        : '';
      const strength =
        typeof record.strength === 'number' ? record.strength
        : typeof record.demand === 'number' ? record.demand
        : typeof record.score === 'number' ? record.score
        : typeof record.index === 'number' ? record.index
        : Number.NaN;
      if (region && Number.isFinite(strength)) {
        signals.push({ region, strength, source });
      }
    }
    return signals;
  }

  for (const [region, value] of Object.entries(geo as Record<string, any>)) {
    let strength = Number.NaN;
    if (typeof value === 'number') strength = value;
    else if (value && typeof value === 'object') {
      const record = value as Record<string, any>;
      if (typeof record.strength === 'number') strength = record.strength;
      else if (typeof record.demand === 'number') strength = record.demand;
      else if (typeof record.score === 'number') strength = record.score;
    }
    if (Number.isFinite(strength)) {
      signals.push({ region, strength, source });
    }
  }
  return signals;
}

@Injectable()
export class GeoService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
  ) {}

  async getHeatmap(
    userId: string,
    options: { category?: OpportunityCategory; minSamples?: number } = {},
  ) {
    const opportunities = await this.opportunityRepository.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      take: 500,
    });

    const signals: GeoSignal[] = [];
    let unparsedCount = 0;
    let considered = 0;

    for (const opportunity of opportunities) {
      if (options.category && opportunity.category !== options.category) continue;
      if (!opportunity.geographicDemand) continue;
      considered++;
      const extracted = extractSignals(opportunity);
      if (extracted.length === 0) {
        // The payload existed but nothing in it was readable. Say so.
        unparsedCount++;
        continue;
      }
      signals.push(...extracted);
    }

    const heatmap = buildHeatmap(signals, unparsedCount);

    const minSamples = Math.max(1, Number(options.minSamples) || 1);
    const regions = heatmap.regions.filter((r) => r.sampleCount >= minSamples);

    return {
      regions,
      suppressedForLowSamples: heatmap.regions.length - regions.length,
      totalSignals: heatmap.totalSignals,
      unparsedCount: heatmap.unparsedCount,
      opportunitiesConsidered: considered,
      category: options.category || null,
    };
  }
}
