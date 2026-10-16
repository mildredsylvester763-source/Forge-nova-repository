// ============================================================================
// FILE: /apps/api/src/modules/budgets/budgets.service.ts
// ============================================================================
// The engine decides variance; this service owns data. Actual spend for a
// budget line is the sum of that category's expenses inside the month.
// Duplicates are refused by name — a budget is amended, never shadowed.

import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Budget } from './entities/budget.entity';
import { CreateBudgetDto } from './dto/budget.dto';
import { Expense } from '../expenses/entities/expense.entity';
import { budgetVariance } from './engine/budget-variance';

@Injectable()
export class BudgetsService {
  constructor(
    @InjectRepository(Budget)
    private readonly budgetRepository: Repository<Budget>,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
  ) {}

  async create(userId: string, dto: CreateBudgetDto): Promise<Budget> {
    const category = dto.category.trim().toLowerCase();
    const existing = await this.budgetRepository.findOne({
      where: { userId, category, month: dto.month },
      withDeleted: true,
    });
    if (existing) {
      throw new ConflictException(`budget-exists:${category}:${dto.month}`);
    }
    return this.budgetRepository.save(
      this.budgetRepository.create({
        userId,
        category,
        month: dto.month,
        budgetCents: dto.budgetCents,
        ...(dto.notes ? { notes: dto.notes } : {}),
      }),
    );
  }

  async list(userId: string): Promise<Budget[]> {
    return this.budgetRepository.find({ where: { userId }, order: { month: 'DESC', category: 'ASC' } });
  }

  async variance(userId: string, category: string, month: string) {
    const budget = await this.budgetRepository.findOne({
      where: { userId, category: category.trim().toLowerCase(), month },
    });
    if (!budget) {
      throw new BadRequestException(`budget-not-found:${category}:${month}`);
    }
    const [from, to] = [new Date(`${month}-01T00:00:00.000Z`), monthEnd(month)];
    const expenses = await this.expenseRepository.find({ where: { userId } });
    const actualCents = expenses
      .filter((e) => e.category === budget.category && e.incurredAt >= from && e.incurredAt < to)
      .reduce((sum, e) => sum + e.amountCents, 0);
    const verdict = budgetVariance(budget.budgetCents, actualCents);
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    return {
      budgetId: budget.id,
      category: budget.category,
      month: budget.month,
      budgetCents: budget.budgetCents,
      actualCents,
      ...verdict.value,
    };
  }
}

function monthEnd(month: string): Date {
  const [year, m] = month.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(year, m, 1));
}
