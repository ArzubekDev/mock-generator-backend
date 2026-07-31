import { faker } from '@faker-js/faker';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../projects/entities/project.entity';

// 1. Создаем интерфейсы для описываемых JSON-схем
interface PropertySchema {
  type?: string;
  faker?: string;
  enum?: string[];
  format?: string;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, PropertySchema>;
}

interface ResourceSchema {
  type?: string;
  properties?: Record<string, PropertySchema>;
}

@Injectable()
export class MockEngineService {
  constructor(
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
  ) {}

  async generateMockData(
    endpointKey: string,
    resource: string,
    query: Record<string, unknown>,
  ) {
    // 1. Находим проект по ключу
    const project = await this.projectRepo.findOne({
      where: { endpointKey },
    });

    if (!project) {
      throw new NotFoundException('Mock API not found');
    }

    // 2. Эмуляция задержки
    if (project.delay > 0) {
      await this.sleep(project.delay);
    }

    // 3. Эмуляция ошибки
    if (project.errorRate > 0) {
      const random = Math.random() * 100;
      if (random < project.errorRate) {
        throw new NotFoundException('Simulated server error');
      }
    }

    // 4. Получаем схему для ресурса из JSON-проекта
    const schemas = project.schemaJson as Record<string, ResourceSchema>;
    const schema = schemas?.[resource];

    if (!schema) {
      throw new NotFoundException(`Resource "${resource}" not found in schema`);
    }

    // 5. Определяем количество записей
    const rawLimit = typeof query.limit === 'string' ? query.limit : '20';
    const limit = parseInt(rawLimit, 10) || 20;
    const count = Math.min(limit, 100); // макс 100 за раз

    // 6. Генерируем данные
    const data: Record<string, unknown>[] = [];
    for (let i = 0; i < count; i++) {
      data.push(this.generateObject(schema));
    }

    return {
      data,
      meta: {
        resource,
        count: data.length,
        endpoint: `/${endpointKey}/${resource}`,
        delay: project.delay,
      },
    };
  }

  private generateObject(schema: ResourceSchema): Record<string, unknown> {
    if (schema.type === 'object' && schema.properties) {
      const result: Record<string, unknown> = {};
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        result[key] = this.generateValue(propSchema);
      }
      return result;
    }
    return { value: this.generateValue(schema) };
  }

  private generateValue(prop: PropertySchema): unknown {
    // 1. Если явно указан путь faker (например, "internet.email", "person.fullName")
    if (prop.faker) {
      return this.getFakerValue(prop.faker);
    }

    // 2. Если указан format (даже без explicit type: 'string')
    if (prop.format === 'email') {
      return faker.internet.email();
    }
    if (prop.format === 'date-time' || prop.format === 'date') {
      return faker.date.recent().toISOString();
    }
    if (prop.format === 'uuid') {
      return faker.string.uuid();
    }

    // 3. Обработка по типам
    const type = prop.type;

    switch (type) {
      case 'string':
        if (prop.enum) {
          return prop.enum[Math.floor(Math.random() * prop.enum.length)];
        }
        return faker.lorem.word();

      case 'integer':
      case 'number': {
        const min = prop.minimum ?? 1;
        const max = prop.maximum ?? 1000;
        if (prop.type === 'integer') {
          return faker.number.int({ min, max });
        }
        return faker.number.float({ min, max, fractionDigits: 2 });
      }

      case 'boolean':
        return faker.datatype.boolean();

      default:
        return faker.lorem.word();
    }
  }

  private getFakerValue(path: string): string {
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
        return `unknown:${path}`;
      }
    }

    if (typeof current === 'function') {
      const result = (current as () => unknown)();
      return String(result);
    }

    return String(current);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
