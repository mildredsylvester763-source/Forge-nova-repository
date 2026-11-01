import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campaign } from './entities/campaign.entity';
import { CampaignEvent } from './entities/campaign-event.entity';
import { EmailTemplate } from './entities/email-template.entity';
import { EmailCampaignsController } from './email-campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { TemplatesService } from './templates.service';

@Module({
  imports: [TypeOrmModule.forFeature([EmailTemplate, Campaign, CampaignEvent])],
  controllers: [EmailCampaignsController],
  providers: [TemplatesService, CampaignsService],
  exports: [TemplatesService, CampaignsService],
})
export class EmailCampaignsModule {}
