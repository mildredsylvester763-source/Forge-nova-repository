import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerCredit } from './entities/customer-credit.entity';
import { CreditEvent } from './entities/credit-event.entity';
import { CreditLimitsController } from './credit-limits.controller';
import { CreditService } from './credit-limits.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerCredit, CreditEvent])],
  controllers: [CreditLimitsController],
  providers: [CreditService],
  exports: [CreditService],
})
export class CreditLimitsModule {}
