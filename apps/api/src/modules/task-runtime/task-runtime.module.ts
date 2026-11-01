import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskRun } from './entities/task-run.entity';
import { TaskRuntimeController } from './task-runtime.controller';
import { TaskRuntimeService } from './task-runtime.service';

@Module({
  imports: [TypeOrmModule.forFeature([TaskRun])],
  controllers: [TaskRuntimeController],
  providers: [TaskRuntimeService],
  exports: [TaskRuntimeService],
})
export class TaskRuntimeModule {}
