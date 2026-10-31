import { Body, Controller, Get, Post, Put, Query, Request } from '@nestjs/common';
import { WebSearchService } from './web-search.service';
import {
  CreateCitationDto,
  DomainRulesDto,
  FetchPageDto,
  SearchWebDto,
} from './dto/web-search.dto';

@Controller('web-search')
export class WebSearchController {
  constructor(private readonly webSearch: WebSearchService) {}

  @Post('search')
  async search(@Request() req: any, @Body() dto: SearchWebDto) {
    return this.webSearch.search(req.user.id, dto);
  }

  @Get('queries')
  async queries(@Request() req: any, @Query('limit') limit?: string) {
    return this.webSearch.listQueries(req.user.id, limit);
  }

  @Post('pages')
  async fetchPage(@Request() req: any, @Body() dto: FetchPageDto) {
    return this.webSearch.fetchPage(req.user.id, dto);
  }

  @Get('pages')
  async pages(@Request() req: any, @Query('limit') limit?: string) {
    return this.webSearch.listPages(req.user.id, limit);
  }

  @Post('citations')
  async createCitation(@Request() req: any, @Body() dto: CreateCitationDto) {
    return this.webSearch.createCitation(req.user.id, dto);
  }

  @Get('citations')
  async citations(@Request() req: any, @Query('limit') limit?: string) {
    return this.webSearch.listCitations(req.user.id, limit);
  }

  @Put('domain-rules')
  async setDomainRules(@Request() req: any, @Body() dto: DomainRulesDto) {
    return this.webSearch.setDomainRules(req.user.id, dto);
  }

  @Get('domain-rules')
  async domainRules(@Request() req: any, @Query('workspace') workspace?: string) {
    return this.webSearch.getDomainRules(req.user.id, workspace);
  }
}
