import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
} from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { TemplatesService } from './templates.service';
import {
  CreateCampaignDto,
  RecordEventDto,
  RenderTemplateDto,
  SaveTemplateDto,
} from './dto/email-campaigns.dto';

@Controller('email-campaigns')
export class EmailCampaignsController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly campaignsService: CampaignsService,
  ) {}

  @Post('templates')
  async createTemplate(@Request() req: any, @Body() dto: SaveTemplateDto) {
    return this.templatesService.createTemplate(req.user.id, dto);
  }

  @Get('templates')
  async listTemplates(@Request() req: any) {
    return this.templatesService.listTemplates(req.user.id);
  }

  @Post('templates/:id/publish')
  async publishTemplate(@Request() req: any, @Param('id') templateId: string) {
    return this.templatesService.publishTemplate(req.user.id, templateId);
  }

  @Post('templates/:id/render')
  async renderTemplate(
    @Request() req: any,
    @Param('id') templateId: string,
    @Body() dto: RenderTemplateDto,
  ) {
    return this.templatesService.renderPreview(req.user.id, templateId, dto);
  }

  @Post('campaigns')
  async createCampaign(@Request() req: any, @Body() dto: CreateCampaignDto) {
    return this.campaignsService.createCampaign(req.user.id, dto);
  }

  @Get('campaigns')
  async listCampaigns(@Request() req: any) {
    return this.campaignsService.listCampaigns(req.user.id);
  }

  @Post('campaigns/:id/events')
  async recordEvent(
    @Request() req: any,
    @Param('id') campaignId: string,
    @Body() dto: RecordEventDto,
  ) {
    return this.campaignsService.recordEvent(req.user.id, campaignId, dto);
  }

  @Get('campaigns/:id/summary')
  async campaignSummary(@Request() req: any, @Param('id') campaignId: string) {
    return this.campaignsService.campaignSummary(req.user.id, campaignId);
  }
}
