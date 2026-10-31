import { Body, Controller, Get, Param, Post, Query, Request } from '@nestjs/common';
import { SearchIntegrityService } from './search-integrity.service';
import {
  CachePutDto,
  FactsDto,
  PackBuildDto,
  QuotesDto,
  RateCheckDto,
  ReferenceSearchDto,
  ScanContentDto,
} from './dto/search-integrity.dto';

@Controller('search-integrity')
export class SearchIntegrityController {
  constructor(private readonly service: SearchIntegrityService) {}

  @Get('quotes/licenses')
  listQuoteLicenses() {
    return { licenses: this.service.listQuoteLicenses() };
  }

  @Get('references/media')
  listReferenceMedia() {
    return { media: this.service.listReferenceMedia() };
  }

  @Get('references/licenses')
  listReferenceLicenses() {
    return { licenses: this.service.listReferenceLicenses() };
  }

  @Post('facts')
  separateFacts(@Body() dto: FactsDto) {
    return this.service.separateFacts(dto);
  }

  @Post('quotes')
  planQuotes(@Body() dto: QuotesDto) {
    return this.service.planQuotes(dto);
  }

  @Post('references/search')
  searchReferences(@Body() dto: ReferenceSearchDto) {
    return this.service.searchReferences(dto);
  }

  @Post('rate/check')
  checkRateLimit(@Body() dto: RateCheckDto) {
    return this.service.checkRateLimit(dto);
  }

  @Post('cache')
  async putCacheEntry(@Request() req: { user: { id: string } }, @Body() dto: CachePutDto) {
    return this.service.putCacheEntry(req.user.id, dto);
  }

  @Get('cache')
  async getCacheEntry(@Request() req: { user: { id: string } }, @Query('key') key: string) {
    return this.service.getCacheEntry(req.user.id, { key });
  }

  @Post('injection/wrap')
  wrapFetchedContent(@Body() dto: ScanContentDto) {
    return this.service.wrapFetchedContent(dto);
  }

  @Post('injection/scan')
  scanFetchedContent(@Body() dto: ScanContentDto) {
    return this.service.scanFetchedContent(dto);
  }

  @Post('packs')
  async buildKnowledgePack(@Request() req: { user: { id: string } }, @Body() dto: PackBuildDto) {
    return this.service.buildKnowledgePack(req.user.id, dto);
  }

  @Get('packs')
  async listKnowledgePacks(@Request() req: { user: { id: string } }) {
    return this.service.listKnowledgePacks(req.user.id);
  }

  @Get('packs/:id')
  async getKnowledgePack(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.service.getKnowledgePack(req.user.id, id);
  }
}
