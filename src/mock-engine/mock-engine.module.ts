import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../projects/entities/project.entity';
import { MockEngineController } from './mock-engine.controller';
import { MockEngineService } from './mock-engine.service';

@Module({
  imports: [TypeOrmModule.forFeature([Project])],
  controllers: [MockEngineController],
  providers: [MockEngineService],
})
export class MockEngineModule {}
