import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgePack } from './entities/knowledge-pack.entity';
import { SearchCacheEntry } from './entities/search-cache-entry.entity';
import { SearchIntegrityController } from './search-integrity.controller';
import { SearchIntegrityService } from './search-integrity.service';

@Module({
  imports: [TypeOrmModule.forFeature([SearchCacheEntry, KnowledgePack])],
  controllers: [SearchIntegrityController],
  providers: [SearchIntegrityService],
  exports: [SearchIntegrityService],
})
export class SearchIntegrityModule {}
