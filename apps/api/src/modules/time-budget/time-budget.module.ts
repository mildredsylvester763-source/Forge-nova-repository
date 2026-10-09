import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeBudgetService } from './time-budget.service';
import { TimeBudgetController } from './time-budget.controller';
import { TimeBudget } from './entities/time-budget.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TimeBudget])],
  controllers: [TimeBudgetController],
  providers: [TimeBudgetService],
  exports: [TimeBudgetService],
})
export class TimeBudgetModule {}
