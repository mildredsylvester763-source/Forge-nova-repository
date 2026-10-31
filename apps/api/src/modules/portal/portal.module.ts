import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PortalSession } from './entities/portal-session.entity';
import { PortalVisit } from './entities/portal-visit.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [TypeOrmModule.forFeature([PortalSession, PortalVisit, Invoice, Quote])],
  controllers: [PortalController],
  providers: [PortalService],
  exports: [PortalService],
})
export class PortalModule {}
