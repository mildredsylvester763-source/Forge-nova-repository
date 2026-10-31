// ============================================================================
// FILE: /apps/api/src/modules/websites/sites.service.ts
// ============================================================================

// Website builder service. Sites start as drafts from a template, collect
// pages built from section blocks, and only go live once they have at least
// one page. Nothing here claims to host anything: publishing records the
// honest status change and the moment it happened.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Site } from './entities/site.entity';
import { SitePage } from './entities/site-page.entity';
import { CreatePageDto, CreateSiteDto } from './dto/websites.dto';
import {
  planPublish,
  validateBlocks,
  validatePageTitle,
  validateSiteName,
  validateSlug,
  validateTemplate,
} from './engine/website-engine';

@Injectable()
export class SitesService {
  constructor(
    @InjectRepository(Site)
    private readonly siteRepository: Repository<Site>,
    @InjectRepository(SitePage)
    private readonly pageRepository: Repository<SitePage>,
  ) {}

  private async requireSite(userId: string, siteId: string): Promise<Site> {
    const site = await this.siteRepository.findOne({ where: { userId, id: siteId } });
    if (!site) {
      throw new NotFoundException('site-not-found');
    }
    return site;
  }

  async createSite(userId: string, dto: CreateSiteDto) {
    const nameVerdict = validateSiteName(dto.name);
    if (!nameVerdict.ok) {
      throw new BadRequestException(nameVerdict.reason);
    }
    const templateVerdict = validateTemplate(dto.template);
    if (!templateVerdict.ok) {
      throw new BadRequestException(templateVerdict.reason);
    }
    const owned = await this.siteRepository.find({ where: { userId } });
    const duplicate = owned.find(
      (candidate) => candidate.name.toLowerCase() === nameVerdict.value.toLowerCase(),
    );
    if (duplicate) {
      throw new ConflictException('site-name-exists');
    }
    return this.siteRepository.save(
      this.siteRepository.create({
        userId,
        name: nameVerdict.value,
        template: templateVerdict.value,
        status: 'draft',
        publishedAt: null,
      }),
    );
  }

  async listSites(userId: string) {
    return this.siteRepository.find({ where: { userId }, order: { createdAt: 'ASC' } });
  }

  async addPage(userId: string, siteId: string, dto: CreatePageDto) {
    const site = await this.requireSite(userId, siteId);
    const titleVerdict = validatePageTitle(dto.title);
    if (!titleVerdict.ok) {
      throw new BadRequestException(titleVerdict.reason);
    }
    const slugVerdict = validateSlug(dto.slug);
    if (!slugVerdict.ok) {
      throw new BadRequestException(slugVerdict.reason);
    }
    const blocksVerdict = validateBlocks(dto.blocks);
    if (!blocksVerdict.ok) {
      throw new BadRequestException(blocksVerdict.reason);
    }
    const pages = await this.pageRepository.find({ where: { userId, siteId: site.id } });
    if (pages.some((page) => page.slug === slugVerdict.value)) {
      throw new ConflictException('page-slug-exists');
    }
    return this.pageRepository.save(
      this.pageRepository.create({
        userId,
        siteId: site.id,
        title: titleVerdict.value,
        slug: slugVerdict.value,
        blocks: blocksVerdict.value,
        position: pages.length,
      }),
    );
  }

  async listPages(userId: string, siteId: string) {
    const site = await this.requireSite(userId, siteId);
    return this.pageRepository.find({
      where: { userId, siteId: site.id },
      order: { position: 'ASC' },
    });
  }

  async publishSite(userId: string, siteId: string) {
    const site = await this.requireSite(userId, siteId);
    const pages = await this.pageRepository.find({ where: { userId, siteId: site.id } });
    const plan = planPublish(pages.length);
    if (!plan.ok) {
      throw new BadRequestException(plan.reason);
    }
    site.status = plan.value;
    site.publishedAt = new Date();
    const saved = await this.siteRepository.save(site);
    return { id: saved.id, status: saved.status, publishedAt: saved.publishedAt, pageCount: pages.length };
  }

  async unpublishSite(userId: string, siteId: string) {
    const site = await this.requireSite(userId, siteId);
    site.status = 'draft';
    site.publishedAt = null;
    const saved = await this.siteRepository.save(site);
    return { id: saved.id, status: saved.status, publishedAt: saved.publishedAt };
  }
}
