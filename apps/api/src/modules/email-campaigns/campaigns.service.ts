import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from './entities/campaign.entity';
import { CampaignEvent } from './entities/campaign-event.entity';
import { EmailTemplate } from './entities/email-template.entity';
import { CreateCampaignDto, RecordEventDto } from './dto/email-campaigns.dto';
import {
  computeCampaignMetrics,
  validateEmail,
  validateEventType,
  validateSubject,
  validateTemplateName,
  CampaignMetrics,
} from './engine/email-campaign-engine';

// Campaigns and their analytics. Everything here is HONEST: a campaign is a
// recorded fact with status 'recorded', engagement events are recorded one
// by one, and every rate is computed from the recorded events using the
// industry formulas. No number is ever invented or faked as sent.

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Campaign)
    private readonly campaigns: Repository<Campaign>,
    @InjectRepository(CampaignEvent)
    private readonly events: Repository<CampaignEvent>,
    @InjectRepository(EmailTemplate)
    private readonly templates: Repository<EmailTemplate>,
  ) {}

  async createCampaign(
    ownerUserId: string,
    dto: CreateCampaignDto,
  ): Promise<Campaign> {
    const name = validateTemplateName(dto.name);
    if (!name.ok) throw new BadRequestException(name.reason);
    const subject = validateSubject(dto.subject);
    if (!subject.ok) throw new BadRequestException(subject.reason);
    if (dto.templateId !== undefined) {
      const template = await this.templates.findOne({
        where: { id: dto.templateId, userId: ownerUserId },
      });
      if (!template) throw new BadRequestException('template-not-found');
    }
    const existing = await this.campaigns.findOne({
      where: { userId: ownerUserId, name: name.value },
    });
    if (existing) throw new BadRequestException('campaign-name-exists');
    return this.campaigns.save(
      this.campaigns.create({
        userId: ownerUserId,
        name: name.value,
        subject: subject.value,
        templateId: dto.templateId ?? null,
        status: 'recorded',
        createdAt: new Date(),
      }),
    );
  }

  async recordEvent(
    ownerUserId: string,
    campaignId: string,
    dto: RecordEventDto,
  ): Promise<CampaignEvent> {
    const campaign = await this.campaigns.findOne({
      where: { id: campaignId, userId: ownerUserId },
    });
    if (!campaign) throw new BadRequestException('campaign-not-found');
    const email = validateEmail(dto.email);
    if (!email.ok) throw new BadRequestException(email.reason);
    const eventType = validateEventType(dto.eventType);
    if (!eventType.ok) throw new BadRequestException(eventType.reason);
    return this.events.save(
      this.events.create({
        userId: ownerUserId,
        campaignId,
        email: email.value,
        eventType: eventType.value,
        createdAt: new Date(),
      }),
    );
  }

  async campaignSummary(
    ownerUserId: string,
    campaignId: string,
  ): Promise<CampaignMetrics> {
    const campaign = await this.campaigns.findOne({
      where: { id: campaignId, userId: ownerUserId },
    });
    if (!campaign) throw new BadRequestException('campaign-not-found');
    const events = await this.events.find({
      where: { userId: ownerUserId, campaignId },
    });
    return computeCampaignMetrics(
      events.map((event) => ({ email: event.email, type: event.eventType })),
    );
  }

  async listCampaigns(ownerUserId: string): Promise<Campaign[]> {
    return this.campaigns.find({ where: { userId: ownerUserId } });
  }
}
