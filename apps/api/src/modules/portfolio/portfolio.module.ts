import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortfolioService } from './portfolio.service';
import { PortfolioController } from './portfolio.controller';
import { Product } from '../products/entities/product.entity';
import { Opportunity } from '../opportunities/entities/opportunity.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Opportunity])],
  controllers: [PortfolioController],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
