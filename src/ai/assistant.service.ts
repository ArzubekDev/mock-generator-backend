import OpenAI from 'openai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private openai: OpenAI | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      this.logger.warn(
        'OPENAI_API_KEY is not set — assistant will be unavailable',
      );
    }
  }

  async *streamReply(messages: ChatMessage[]) {
    if (!this.openai) {
      throw new Error('AI-ассистент временно недоступен');
    }

    const stream = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: this.buildSystemPrompt() },
        ...messages,
      ],
      stream: true,
      temperature: 0.5,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  private buildSystemPrompt(): string {
    return `Ты — ассистент на сайте Levin API.

Levin API — сервис, который за пару минут даёт готовый mock REST API. Пользователь описывает структуру данных вручную через JSON Schema или через AI-промпт, и сервис генерирует фейковые ответы через @faker-js/faker.

Отвечай кратко и по делу на вопросы о том, как пользоваться сервисом, что такое delay/errorRate/defaultLimit, как создать mock API, где искать документацию. Если вопрос не связан с Levin API — вежливо скажи, что ты помогаешь только с вопросами о сервисе.`;
  }
}
