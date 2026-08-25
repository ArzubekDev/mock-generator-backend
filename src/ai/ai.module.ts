import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [ConfigModule],
  controllers: [AssistantController],
  providers: [AiService, AssistantService],
  exports: [AiService, AssistantService],
})
export class AiModule {}
