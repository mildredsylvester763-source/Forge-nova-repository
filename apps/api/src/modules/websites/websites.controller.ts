// ============================================================================
// FILE: /apps/api/src/modules/websites/websites.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Post, Request } from '@nestjs/common';
import { SitesService } from './sites.service';
import { DomainsService } from './domains.service';
import {
  AddDomainDto,
  CreatePageDto,
  CreateSiteDto,
  VerifyDomainDto,
} from './dto/websites.dto';

@Controller('websites')
export class WebsitesController {
  constructor(
    private readonly sitesService: SitesService,
    private readonly domainsService: DomainsService,
  ) {}

  @Post('sites')
  async createSite(@Request() req: any, @Body() dto: CreateSiteDto) {
    return this.sitesService.createSite(req.user.id, dto);
  }

  @Get('sites')
  async listSites(@Request() req: any) {
    return this.sitesService.listSites(req.user.id);
  }

  @Post('sites/:siteId/pages')
  async addPage(@Request() req: any, @Param('siteId') siteId: string, @Body() dto: CreatePageDto) {
    return this.sitesService.addPage(req.user.id, siteId, dto);
  }

  @Get('sites/:siteId/pages')
  async listPages(@Request() req: any, @Param('siteId') siteId: string) {
    return this.sitesService.listPages(req.user.id, siteId);
  }

  @Post('sites/:siteId/publish')
  async publishSite(@Request() req: any, @Param('siteId') siteId: string) {
    return this.sitesService.publishSite(req.user.id, siteId);
  }

  @Post('sites/:siteId/unpublish')
  async unpublishSite(@Request() req: any, @Param('siteId') siteId: string) {
    return this.sitesService.unpublishSite(req.user.id, siteId);
  }

  @Post('sites/:siteId/domains')
  async addDomain(@Request() req: any, @Param('siteId') siteId: string, @Body() dto: AddDomainDto) {
    return this.domainsService.addDomain(req.user.id, siteId, dto);
  }

  @Get('sites/:siteId/domains')
  async listDomains(@Request() req: any, @Param('siteId') siteId: string) {
    return this.domainsService.listDomains(req.user.id, siteId);
  }

  @Post('sites/:siteId/domains/:domainId/verify')
  async verifyDomain(
    @Request() req: any,
    @Param('siteId') siteId: string,
    @Param('domainId') domainId: string,
    @Body() dto: VerifyDomainDto,
  ) {
    return this.domainsService.verifyDomain(req.user.id, siteId, domainId, dto);
  }

  @Post('sites/:siteId/domains/:domainId/primary')
  async setPrimary(@Request() req: any, @Param('siteId') siteId: string, @Param('domainId') domainId: string) {
    return this.domainsService.setPrimary(req.user.id, siteId, domainId);
  }
}
