// ============================================================================
// FILE: /apps/api/src/modules/websites/websites.module.ts
// ============================================================================

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Site } from './entities/site.entity';
import { SitePage } from './entities/site-page.entity';
import { SiteDomain } from './entities/site-domain.entity';
import { SitesService } from './sites.service';
import { DomainsService } from './domains.service';
import { WebsitesController } from './websites.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Site, SitePage, SiteDomain])],
  providers: [SitesService, DomainsService],
  controllers: [WebsitesController],
})
export class WebsitesModule {}
