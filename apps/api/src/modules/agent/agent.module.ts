// ============================================================================
// FILE: /apps/api/src/modules/agent/agent.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentCommand } from './entities/agent-command.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Payment } from '../payments/entities/payment.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';

@Module({
  imports: [TypeOrmModule.forFeature([AgentCommand, Invoice, Payment, Expense])],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
