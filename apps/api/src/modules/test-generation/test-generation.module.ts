import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeneratedSuite } from './entities/generated-suite.entity';
import { TestGenerationController } from './test-generation.controller';
import { TestGenerationService } from './test-generation.service';

@Module({
  imports: [TypeOrmModule.forFeature([GeneratedSuite])],
  controllers: [TestGenerationController],
  providers: [TestGenerationService],
  exports: [TestGenerationService],
})
export class TestGenerationModule {}
