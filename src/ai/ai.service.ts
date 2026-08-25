import { faker } from '@faker-js/faker';
import OpenAI from 'openai';
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResourceSchema } from '../shared/types';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not defined in environment variables');
    }
    this.openai = new OpenAI({ apiKey });
  }

  async generateSchema(userPrompt: string): Promise<Record<string, unknown>> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: this.buildSystemPrompt() },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const text = completion.choices[0].message.content;
      if (!text) throw new Error('Empty response from OpenAI');

      this.logger.debug('OpenAI raw response:\n', text);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(text);

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new BadRequestException('AI вернул невалидную структуру');
      }

      const invalidPaths = this.validateSchemaFakerPaths(
        parsed as Record<string, unknown>,
      );
      if (invalidPaths.length > 0) {
        this.logger.warn(
          `AI generated unknown faker paths: ${invalidPaths.join(', ')}`,
        );
        this.sanitizeFakerPaths(parsed as Record<string, unknown>);
      }

      return parsed as Record<string, unknown>;
    } catch (error) {
      this.logger.error('OpenAI generation failed', error);
      throw new BadRequestException(
        'AI не смог сгенерировать валидную схему. Попробуйте переформулировать запрос.',
      );
    }
  }

  private resolveFakerPath(path: string): unknown {
    const parts = path.split('.');
    let current: unknown = faker;

    for (const part of parts) {
      if (
        current &&
        typeof current === 'object' &&
        part in (current as Record<string, unknown>)
      ) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private validateSchemaFakerPaths(schema: Record<string, unknown>): string[] {
    const invalidPaths: string[] = [];
    const resources = schema as Record<string, ResourceSchema>;

    for (const resource of Object.values(resources)) {
      const properties = resource?.properties;
      if (!properties) continue;

      for (const field of Object.values(properties)) {
        if (
          field.faker &&
          typeof this.resolveFakerPath(field.faker) !== 'function'
        ) {
          invalidPaths.push(field.faker);
        }
      }
    }

    return invalidPaths;
  }

  private sanitizeFakerPaths(schema: Record<string, unknown>): void {
    const resources = schema as Record<string, ResourceSchema>;

    for (const resource of Object.values(resources)) {
      const properties = resource?.properties;
      if (!properties) continue;

      for (const field of Object.values(properties)) {
        if (
          field.faker &&
          typeof this.resolveFakerPath(field.faker) !== 'function'
        ) {
          delete field.faker;
          field.type = field.type ?? 'string';
        }
      }
    }
  }

  private buildSystemPrompt(): string {
    return `Ты — генератор JSON Schema для mock API сервиса Levin API.

КОНТЕКСТ:
Levin API — сервис, который за пару минут даёт готовый mock REST API. Пользователь описывает структуру данных в JSON Schema, а сервис генерирует фейковые ответы через @faker-js/faker.

ФОРМАТ ОТВЕТА (строго):
1. Отвечай ТОЛЬКО валидным JSON. Без markdown-разметки вне JSON, без пояснений.
2. Верхний уровень — объект, где КЛЮЧ = имя ресурса в URL (например "users", "products", "orders").
3. Значение — JSON Schema объекта с полями type="object" и properties.

ПРАВИЛА СХЕМЫ:
- Каждый ресурс: { "type": "object", "properties": { ... } }
- Поддерживаемые типы полей: string, integer, number, boolean
- Для faker.js указывай путь в поле "faker" (namespace.method)
- Для email используй "format": "email"
- Для UUID используй "format": "uuid"
- Для дат используй "format": "date-time"
- Для чисел с диапазоном используй "minimum" и "maximum"
- Для enum используй "enum": ["value1", "value2"]
- Добавляй реалистичные поля под контекст запроса. Минимум 5-7 полей на ресурс.
- Если в запросе несколько сущностей — создай несколько ключей в JSON.

ПОПУЛЯРНЫЕ FAKER-ПУТИ:
- "person.fullName", "person.firstName"
- "internet.email", "internet.username"
- "phone.number"
- "commerce.productName", "commerce.price", "commerce.productDescription"
- "location.city"
- "company.name"
- "lorem.sentence"
- "image.avatar"
- "string.uuid"

ОГРАНИЧЕНИЯ (критически важно):
- НЕ поддерживаются вложенные объекты внутри properties
- НЕ поддерживаются массивы как тип поля
- НЕ поддерживается $ref
- Держи схему плоской: ресурс → объект → простые поля
- Для чисел: integer (целое) или number (дробное, 2 знака)

ПРИМЕР ПРАВИЛЬНОГО ОТВЕТА:
{
  "users": {
    "type": "object",
    "properties": {
      "id": { "type": "integer", "minimum": 1, "maximum": 100000 },
      "name": { "type": "string", "faker": "person.fullName" },
      "email": { "type": "string", "format": "email" },
      "age": { "type": "integer", "minimum": 18, "maximum": 65 },
      "role": { "type": "string", "enum": ["admin", "user", "guest"] },
      "isActive": { "type": "boolean" }
    }
  }
}`;
  }
}
