import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TestQualityGolden } from './entities/test-quality-golden.entity';
import { TestQualityController } from './test-quality.controller';
import { TestQualityService } from './test-quality.service';

@Module({
  imports: [TypeOrmModule.forFeature([TestQualityGolden])],
  controllers: [TestQualityController],
  providers: [TestQualityService],
  exports: [TestQualityService],
})
export class TestQualityModule {}
