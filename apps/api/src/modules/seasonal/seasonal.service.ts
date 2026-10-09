// ============================================================================
// FILE: /apps/api/src/modules/seasonal/seasonal.service.ts
// ============================================================================
// Aggregates the user's opportunities into per-category seasonal
// calendars. Each opportunity's seasonalPatterns payload is parsed into 12
// monthly indices (multiple shapes tolerated); opportunities in the same
// category are averaged month-by-month, then the pure engine turns each
// averaged year into peaks, troughs, prep and trigger windows. Unreadable
// payloads are counted, never faked. Zero-trust: scoped by userId.

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { OpportunityCategory } from '../opportunities/enums';
import { buildCalendar, MONTH_COUNT, SeasonalCalendar } from './engine/seasonal-calendar';

// Read one opportunity's payload into 12 indices, or null when nothing in
// it is readable. Accepted shapes:
//   { months: [n x 12] } | { indices: [...] } | { monthlyIndex: [...] }
//   { demandByMonth: { January: n, ... } } | a straight 12-number array
//   { jan: n, feb: n, ... } (three-letter keys, any case)
const SHORT_KEYS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function readIndices(payload: Record<string, any>): number[] | null {
  if (Array.isArray(payload)) {
    return payload.length === MONTH_COUNT && payload.every((v) => typeof v === 'number')
      ? (payload as number[])
      : null;
  }

  for (const key of ['months', 'indices', 'monthlyIndex', 'monthly']) {
    const value = payload[key];
    if (
      Array.isArray(value) &&
      value.length === MONTH_COUNT &&
      value.every((v) => typeof v === 'number')
    ) {
      return value as number[];
    }
  }

  const byName = payload.demandByMonth || payload.byMonth;
  if (byName && typeof byName === 'object' && !Array.isArray(byName)) {
    const indices = new Array<number>(MONTH_COUNT).fill(Number.NaN);
    let found = 0;
    for (const [key, value] of Object.entries(byName as Record<string, any>)) {
      const lower = key.toLowerCase().slice(0, 3);
      const monthIndex = SHORT_KEYS[lower];
      if (monthIndex !== undefined && typeof value === 'number' && Number.isFinite(value)) {
        indices[monthIndex] = value;
        found++;
      }
    }
    if (found === MONTH_COUNT) return indices;
  }

  // Straight short-key record: { jan: 5, feb: 8, ... }
  const shortIndices = new Array<number>(MONTH_COUNT).fill(Number.NaN);
  let shortFound = 0;
  for (const [key, value] of Object.entries(payload)) {
    const monthIndex = SHORT_KEYS[key.toLowerCase()];
    if (monthIndex !== undefined && typeof value === 'number' && Number.isFinite(value)) {
      shortIndices[monthIndex] = value;
      shortFound++;
    }
  }
  if (shortFound === MONTH_COUNT) return shortIndices;

  return null;
}

interface CategoryYear {
  sums: number[];
  counts: number[];
  samples: number;
}

function newCategoryYear(): CategoryYear {
  return {
    sums: new Array<number>(MONTH_COUNT).fill(0),
    counts: new Array<number>(MONTH_COUNT).fill(0),
    samples: 0,
  };
}

function averageYear(year: CategoryYear): number[] {
  return year.sums.map((sum, i) => (year.counts[i] > 0 ? sum / year.counts[i] : 0));
}

@Injectable()
export class SeasonalService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
  ) {}

  async getCalendars(userId: string, category?: OpportunityCategory) {
    const opportunities = await this.opportunityRepository.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      take: 500,
    });

    const perCategory = new Map<OpportunityCategory, CategoryYear>();
    const overall = newCategoryYear();
    let unparsedCount = 0;
    let considered = 0;

    for (const opportunity of opportunities) {
      if (category && opportunity.category !== category) continue;
      const payload = opportunity.seasonalPatterns;
      if (!payload || typeof payload !== 'object') continue;
      considered++;

      const indices = readIndices(payload as Record<string, any>);
      if (!indices) {
        unparsedCount++;
        continue;
      }

      const addTo = (year: CategoryYear) => {
        year.samples++;
        for (let m = 0; m < MONTH_COUNT; m++) {
          year.sums[m] += indices[m];
          year.counts[m]++;
        }
      };

      addTo(overall);
      const bucket = perCategory.get(opportunity.category) || newCategoryYear();
      addTo(bucket);
      perCategory.set(opportunity.category, bucket);
    }

    const calendars: Array<{ category: OpportunityCategory; samples: number; calendar: SeasonalCalendar }> = [];
    for (const [cat, year] of perCategory) {
      calendars.push({
        category: cat,
        samples: year.samples,
        calendar: buildCalendar(averageYear(year)),
      });
    }
    // Busiest categories first; ties broken alphabetically for stability.
    calendars.sort((a, b) => {
      if (b.samples !== a.samples) return b.samples - a.samples;
      return a.category < b.category ? -1 : a.category > b.category ? 1 : 0;
    });

    const merged =
      overall.samples > 0
        ? buildCalendar(averageYear(overall))
        : buildCalendar(new Array<number>(MONTH_COUNT).fill(0));

    return {
      merged,
      categories: calendars,
      opportunitiesConsidered: considered,
      unparsedCount,
      category: category || null,
    };
  }

  async getCategoryCalendar(userId: string, category: OpportunityCategory) {
    const result = await this.getCalendars(userId, category);
    const entry = result.categories.find((c) => c.category === category);
    if (!entry) {
      throw new NotFoundException(
        'No seasonal data for category ' + category + ' yet â run a scan first',
      );
    }
    return {
      category: entry.category,
      samples: entry.samples,
      calendar: entry.calendar,
      unparsedCount: result.unparsedCount,
    };
  }
}
