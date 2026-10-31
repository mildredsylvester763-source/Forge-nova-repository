import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeoAudit } from './entities/seo-audit.entity';
import {
  analyzeSeo,
  validateMetaDescription,
  validateSeoKeyword,
  validateSeoTitle,
} from './engine/seo-engine';

// Honest SEO analysis, in the spirit of tools like Yoast: it runs named
// checks, saves exactly what those checks said, and never promises
// rankings. Audits are saved per owner and per target.

@Injectable()
export class SeoService {
  constructor(
    @InjectRepository(SeoAudit)
    private readonly audits: Repository<SeoAudit>,
  ) {}

  async analyze(
    ownerUserId: string,
    input: {
      title: string;
      metaDescription: string;
      slug: string;
      keyword: string;
      firstHeading: string | null;
      bodyText: string;
      targetId?: string;
    },
  ): Promise<SeoAudit> {
    const title = validateSeoTitle(input.title);
    if (!title.ok) throw new BadRequestException(title.reason);
    const meta = validateMetaDescription(input.metaDescription);
    if (!meta.ok) throw new BadRequestException(meta.reason);
    const keyword = validateSeoKeyword(input.keyword);
    if (!keyword.ok) throw new BadRequestException(keyword.reason);
    if (typeof input.slug !== 'string') {
      throw new BadRequestException('seo-invalid-slug');
    }
    const slug = input.slug.trim();
    if (slug.length < 3 || slug.length > 80) {
      throw new BadRequestException('seo-invalid-slug');
    }
    if (typeof input.bodyText !== 'string') {
      throw new BadRequestException('seo-invalid-body');
    }
    const bodyText = input.bodyText.trim();
    if (bodyText.length < 1 || bodyText.length > 20000) {
      throw new BadRequestException('seo-invalid-body');
    }
    const firstHeading =
      typeof input.firstHeading === 'string' && input.firstHeading.trim().length > 0
        ? input.firstHeading
        : null;
    const result = analyzeSeo({
      title: title.value,
      metaDescription: meta.value,
      slug,
      keyword: keyword.value,
      firstHeading,
      bodyText,
    });
    const targetId =
      typeof input.targetId === 'string' && input.targetId.trim().length > 0
        ? input.targetId.trim()
        : slug;
    return this.audits.save(
      this.audits.create({
        userId: ownerUserId,
        targetId,
        checks: result.checks,
        score: result.score,
        createdAt: new Date(),
      }),
    );
  }

  async listAudits(ownerUserId: string, targetId: string): Promise<SeoAudit[]> {
    return this.audits.find({ where: { userId: ownerUserId, targetId } });
  }
}
