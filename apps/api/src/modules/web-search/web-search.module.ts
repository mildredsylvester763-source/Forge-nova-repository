import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebSearchQuery } from './entities/web-search-query.entity';
import { DomainRule } from './entities/domain-rule.entity';
import { FetchedPage } from './entities/fetched-page.entity';
import { CitationRecord } from './entities/citation-record.entity';
import { WebSearchService } from './web-search.service';
import { WebSearchController } from './web-search.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WebSearchQuery,
      DomainRule,
      FetchedPage,
      CitationRecord,
    ]),
  ],
  providers: [WebSearchService],
  controllers: [WebSearchController],
})
export class WebSearchModule {}
