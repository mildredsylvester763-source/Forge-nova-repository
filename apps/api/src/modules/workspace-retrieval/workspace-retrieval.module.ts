import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceContentItem } from './entities/workspace-content-item.entity';
import { ResearchReport } from './entities/research-report.entity';
import { WorkspaceRetrievalService } from './workspace-retrieval.service';
import { WorkspaceRetrievalController } from './workspace-retrieval.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WorkspaceContentItem, ResearchReport])],
  providers: [WorkspaceRetrievalService],
  controllers: [WorkspaceRetrievalController],
})
export class WorkspaceRetrievalModule {}
