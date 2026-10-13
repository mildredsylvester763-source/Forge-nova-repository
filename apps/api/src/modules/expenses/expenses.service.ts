// ============================================================================
// FILE: /apps/api/src/modules/expenses/expenses.service.ts
// ============================================================================
// Money out with a ledger trail: create validates through the pure engine,
// then posts DR 6000 / CR 1010 once (idempotency key 'expense-<id>'). If the
// chart is not seeded the expense still stands, and the omission is surfaced
// as ledgerWarning — never silent.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from './entities/expense.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { AccountingService } from '../accounting/accounting.service';
import { normalizeCategory, validateExpense } from './engine/expense-validate';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    private readonly accountingService: AccountingService,
  ) {}

  async create(userId: string, dto: CreateExpenseDto): Promise<Expense> {
    const verdict = validateExpense({
      description: dto.description,
      amountCents: dto.amountCents,
      incurredAt: dto.incurredAt,
      now: new Date(),
    });
    if (!verdict.ok) {
      throw new BadRequestException(verdict.reason);
    }
    const expense = await this.expenseRepository.save(
      this.expenseRepository.create({
        userId,
        description: dto.description.trim(),
        vendorName: dto.vendorName,
        amountCents: dto.amountCents,
        category: normalizeCategory(dto.category),
        incurredAt: new Date(dto.incurredAt),
        notes: dto.notes,
      }),
    );
    try {
      const journal = await this.accountingService.postExpenseFor(
        userId,
        expense.id,
        expense.amountCents,
        expense.description,
      );
      expense.journalId = journal.id;
      return this.expenseRepository.save(expense);
    } catch (err) {
      (expense as Expense & { ledgerWarning?: string }).ledgerWarning =
        'not posted to the ledger: ' + (err as Error).message;
      return expense;
    }
  }

  async findAll(userId: string): Promise<Expense[]> {
    return this.expenseRepository.find({ where: { userId }, order: { incurredAt: 'DESC' } });
  }

  async findOne(userId: string, id: string): Promise<Expense> {
    const expense = await this.expenseRepository.findOne({ where: { id, userId } });
    if (!expense) {
      throw new NotFoundException('expense ' + id + ' not found');
    }
    return expense;
  }
}
