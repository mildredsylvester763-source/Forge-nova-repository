// ============================================================================
// FILE: /apps/api/src/modules/websites/domains.service.ts
// ============================================================================

// Custom domain service, following the market standard: adding a domain
// returns the challenge TXT record the owner must create at their DNS host.
// Verification is an honest exact-match of the value they say they set. No
// fake DNS lookups, no pretending the domain is live before it is verified.

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Site } from './entities/site.entity';
import { SiteDomain } from './entities/site-domain.entity';
import { AddDomainDto, VerifyDomainDto } from './dto/websites.dto';
import {
  challengeHost,
  planSetPrimary,
  validateDomainName,
  verificationToken,
  verifyTokenMatch,
} from './engine/domain-engine';

@Injectable()
export class DomainsService {
  constructor(
    @InjectRepository(Site)
    private readonly siteRepository: Repository<Site>,
    @InjectRepository(SiteDomain)
    private readonly domainRepository: Repository<SiteDomain>,
  ) {}

  private async requireSite(userId: string, siteId: string): Promise<Site> {
    const site = await this.siteRepository.findOne({ where: { userId, id: siteId } });
    if (!site) {
      throw new NotFoundException('site-not-found');
    }
    return site;
  }

  async addDomain(userId: string, siteId: string, dto: AddDomainDto) {
    const site = await this.requireSite(userId, siteId);
    const domainVerdict = validateDomainName(dto.domain);
    if (!domainVerdict.ok) {
      throw new BadRequestException(domainVerdict.reason);
    }
    const existing = await this.domainRepository.findOne({
      where: { userId, domain: domainVerdict.value },
    });
    if (existing) {
      throw new ConflictException('domain-exists');
    }
    const token = verificationToken(userId, domainVerdict.value);
    const saved = await this.domainRepository.save(
      this.domainRepository.create({
        userId,
        siteId: site.id,
        domain: domainVerdict.value,
        verificationToken: token,
        status: 'pending',
        isPrimary: false,
        verifiedAt: null,
      }),
    );
    return {
      id: saved.id,
      domain: saved.domain,
      status: saved.status,
      txtHost: challengeHost(saved.domain),
      txtValue: saved.verificationToken,
    };
  }

  async listDomains(userId: string, siteId: string) {
    const site = await this.requireSite(userId, siteId);
    return this.domainRepository.find({
      where: { userId, siteId: site.id },
      order: { createdAt: 'ASC' },
    });
  }

  async verifyDomain(userId: string, siteId: string, domainId: string, dto: VerifyDomainDto) {
    await this.requireSite(userId, siteId);
    const row = await this.domainRepository.findOne({ where: { userId, siteId, id: domainId } });
    if (!row) {
      throw new NotFoundException('domain-not-found');
    }
    const match = verifyTokenMatch(row.verificationToken, dto.txtValue);
    if (!match.ok) {
      throw new BadRequestException(match.reason);
    }
    row.status = 'verified';
    row.verifiedAt = new Date();
    const saved = await this.domainRepository.save(row);
    return { id: saved.id, domain: saved.domain, status: saved.status, verifiedAt: saved.verifiedAt };
  }

  async setPrimary(userId: string, siteId: string, domainId: string) {
    await this.requireSite(userId, siteId);
    const row = await this.domainRepository.findOne({ where: { userId, siteId, id: domainId } });
    if (!row) {
      throw new NotFoundException('domain-not-found');
    }
    const plan = planSetPrimary(row);
    if (!plan.ok) {
      throw new BadRequestException(plan.reason);
    }
    const siblings = await this.domainRepository.find({ where: { userId, siteId } });
    for (const sibling of siblings) {
      const shouldBePrimary = sibling.id === row.id;
      if (sibling.isPrimary !== shouldBePrimary) {
        sibling.isPrimary = shouldBePrimary;
        await this.domainRepository.save(sibling);
      }
    }
    return { id: row.id, domain: row.domain, isPrimary: true };
  }
}
