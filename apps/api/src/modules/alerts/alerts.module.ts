// ============================================================================
// FILE: /apps/api/src/modules/alerts/alerts.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../notifications/entities/notification.entity';
import { Opportunity } from '../opportunities/entities/opportunity.entity';
import { Product } from '../products/entities/product.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, Opportunity, Product]),
    NotificationsModule,   // spin-up persists its paper-trail notification
  ],
  controllers: [AlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
