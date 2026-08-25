import { Body, Controller, Logger, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AssistantService, ChatMessage } from './assistant.service';

@Controller('assistant')
export class AssistantController {
  private readonly logger = new Logger(AssistantController.name);

  constructor(private assistantService: AssistantService) {}

  @Post('chat')
  async chat(@Body('messages') messages: ChatMessage[], @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      for await (const chunk of this.assistantService.streamReply(messages)) {
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
      }
    } catch (error) {
      this.logger.error('Assistant stream failed', error);
      res.write(`data: ${JSON.stringify({ error: 'Ошибка ассистента' })}\n\n`);
    } finally {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
}
