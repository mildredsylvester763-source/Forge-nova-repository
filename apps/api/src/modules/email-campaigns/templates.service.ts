import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailTemplate } from './entities/email-template.entity';
import { RenderTemplateDto, SaveTemplateDto } from './dto/email-campaigns.dto';
import {
  planPublishTemplate,
  renderTemplate,
  validateBlocks,
  validateSubject,
  validateTemplateName,
} from './engine/email-campaign-engine';

// Template library: templates are saved as validated block lists, published
// once (one-way door), and rendered to a text preview with merge variables
// filled in. No email is ever sent; rendering is the honest limit.

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(EmailTemplate)
    private readonly templates: Repository<EmailTemplate>,
  ) {}

  async createTemplate(
    ownerUserId: string,
    dto: SaveTemplateDto,
  ): Promise<EmailTemplate> {
    const name = validateTemplateName(dto.name);
    if (!name.ok) throw new BadRequestException(name.reason);
    const subject = validateSubject(dto.subject);
    if (!subject.ok) throw new BadRequestException(subject.reason);
    const blocks = validateBlocks(dto.blocks);
    if (!blocks.ok) throw new BadRequestException(blocks.reason);
    const existing = await this.templates.findOne({
      where: { userId: ownerUserId, name: name.value },
    });
    if (existing) throw new BadRequestException('template-name-exists');
    return this.templates.save(
      this.templates.create({
        userId: ownerUserId,
        name: name.value,
        subject: subject.value,
        blocksJson: JSON.stringify(blocks.value),
        status: 'draft',
        createdAt: new Date(),
      }),
    );
  }

  async publishTemplate(ownerUserId: string, templateId: string): Promise<EmailTemplate> {
    const template = await this.templates.findOne({
      where: { id: templateId, userId: ownerUserId },
    });
    if (!template) throw new BadRequestException('template-not-found');
    const plan = planPublishTemplate(template.status);
    if (!plan.ok) throw new BadRequestException(plan.reason);
    template.status = plan.value;
    return this.templates.save(template);
  }

  async listTemplates(ownerUserId: string): Promise<EmailTemplate[]> {
    return this.templates.find({ where: { userId: ownerUserId } });
  }

  async renderPreview(
    ownerUserId: string,
    templateId: string,
    dto: RenderTemplateDto,
  ): Promise<{ subject: string; preview: string }> {
    const template = await this.templates.findOne({
      where: { id: templateId, userId: ownerUserId },
    });
    if (!template) throw new BadRequestException('template-not-found');
    const values: Record<string, string> = {};
    if (dto.firstName !== undefined) values.first_name = dto.firstName;
    if (dto.lastName !== undefined) values.last_name = dto.lastName;
    if (dto.shopName !== undefined) values.shop_name = dto.shopName;
    const verdict = renderTemplate({
      subject: template.subject,
      blocks: JSON.parse(template.blocksJson),
      values,
    });
    if (!verdict.ok) throw new BadRequestException(verdict.reason);
    return verdict.value;
  }
}
