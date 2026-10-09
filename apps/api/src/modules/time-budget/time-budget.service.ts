// ============================================================================
// FILE: /apps/api/src/modules/time-budget/time-budget.service.ts
// ============================================================================
// Personal time-budget guardrails (Feature 46) — the honest data layer.
// The planner rules are pure (./engine); this service owns persistence:
//   - One plan per user per week (upsert on weekStart, so re-planning the
//     same week is idempotent, not duplicated).
//   - Actuals are append-only: once time is spent, the record stays.
//   - Every actual entry re-checks the guardrails — spending past a grant
//     is surfaced the moment it happens, not at the end of the week.

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TimeBudget, PlannedAllocation, ActualEntry } from './entities/time-budget.entity';
import { planTime } from './engine/time-planner';
import { UpsertTimeBudgetDto, RecordActualDto } from './dto/time-budget.dto';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Guardrails are only meaningful for a well-formed ISO week start.
function assertWeekStart(weekStart: string): string {
  if (!ISO_DATE_PATTERN.test(weekStart)) {
    throw new ConflictException('weekStart must be an ISO date string (YYYY-MM-DD).');
  }
  const d = new Date(weekStart + 'T00:00:00.000Z');
  if (Number.isNaN(d.getTime())) {
    throw new ConflictException('weekStart is not a valid date.');
  }
  return weekStart;
}

@Injectable()
export class TimeBudgetService {
  constructor(
    @InjectRepository(TimeBudget)
    private readonly timeBudgetRepository: Repository<TimeBudget>,
  ) {}

  // Idempotent per week: re-submitting the same week replaces the plan with
  // fresh grants, but the actuals ledger is preserved — spent time is history.
  async upsertWeek(userId: string, dto: UpsertTimeBudgetDto) {
    const weekStart = assertWeekStart(dto.weekStart);
    const plan = planTime(dto.capacityHours, dto.requests);

    const existing = await this.timeBudgetRepository.findOne({ where: { userId, weekStart } });
    const record = existing || this.timeBudgetRepository.create({ userId, weekStart });

    record.capacityHours = plan.capacityHours;
    record.requests = dto.requests.map(r => ({
      ref: r.ref, label: r.label, requestedHours: r.requestedHours, priority: r.priority,
    }));
    record.allocations = plan.allocations;
    // Re-run the actuals guardrails against the NEW grants.
    record.warnings = [...plan.warnings, ...this.actualsWarnings(record.allocations, record.actuals || [])];
    record.actuals = record.actuals || [];

    const saved = await this.timeBudgetRepository.save(record);
    return { plan: { ...plan, warnings: saved.warnings }, record: saved };
  }

  async getWeek(userId: string, weekStart: string) {
    assertWeekStart(weekStart);
    const record = await this.timeBudgetRepository.findOne({ where: { userId, weekStart } });
    if (!record) throw new NotFoundException('No time budget recorded for week ' + weekStart);
    return record;
  }

  async listWeeks(userId: string, page = 1, limit = 20) {
    const [data, total] = await this.timeBudgetRepository.findAndCount({
      where: { userId },
      order: { weekStart: 'DESC' },
      skip: (Math.max(1, page) - 1) * Math.min(100, Math.max(1, limit)),
      take: Math.min(100, Math.max(1, limit)),
    });
    return { data, total, page: Math.max(1, page), limit: Math.min(100, Math.max(1, limit)) };
  }

  // Append-only ledger. Overrun is allowed (life happens) but never silent:
  // the response and the record both name the exact grant that was exceeded.
  async recordActual(userId: string, weekStart: string, dto: RecordActualDto) {
    assertWeekStart(weekStart);
    const record = await this.timeBudgetRepository.findOne({ where: { userId, weekStart } });
    if (!record) throw new NotFoundException('No time budget recorded for week ' + weekStart);

    const entry: ActualEntry = {
      ref: dto.ref,
      hours: dto.hours,
      note: dto.note,
      loggedAt: new Date().toISOString(),
    };
    record.actuals = [...(record.actuals || []), entry];
    record.warnings = [...this.planWarnings(record), ...this.actualsWarnings(record.allocations, record.actuals)];

    return this.timeBudgetRepository.save(record);
  }

  private planWarnings(record: TimeBudget): string[] {
    return record.warnings.filter(w => !w.includes('overspent') && !w.includes('Spent hours exceed'));
  }

  // Guardrail check: per-ref spend vs grant, and total spend vs capacity.
  private actualsWarnings(allocations: PlannedAllocation[], actuals: ActualEntry[]): string[] {
    const warnings: string[] = [];
    const grantedByRef = new Map(allocations.map(a => [a.ref, a.grantedHours]));
    const spentByRef = new Map<string, number>();
    for (const a of actuals) {
      spentByRef.set(a.ref, (spentByRef.get(a.ref) || 0) + a.hours);
    }
    for (const [ref, spent] of spentByRef) {
      const granted = grantedByRef.get(ref);
      if (granted === undefined) {
        warnings.push('Time logged against ' + ref + ' which has no grant this week — the plan and reality have diverged.');
      } else if (spent > granted + 1e-9) {
        warnings.push('Overspent ' + (Math.round((spent - granted) * 100) / 100) + 'h on ' + ref + ' (grant was ' + granted + 'h).');
      }
    }
    const totalSpent = [...spentByRef.values()].reduce((a, b) => a + b, 0);
    const capacity = allocations.reduce((a, x) => a + x.grantedHours, 0);
    if (capacity > 0 && totalSpent > capacity + 1e-9) {
      warnings.push('Spent hours exceed the weekly budget by ' + (Math.round((totalSpent - capacity) * 100) / 100) + 'h.');
    }
    return warnings;
  }
}
