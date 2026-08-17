import { faker } from '@faker-js/faker';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '../projects/entities/project.entity';

interface PropertySchema {
  type?: string;
  faker?: string;
  fakerArgs?: unknown[];
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
    const project = await this.projectRepo.findOne({
      where: { endpointKey },
    });

    if (!project) {
      throw new NotFoundException('Mock API not found');
    }

    if (project.delay > 0) {
      await this.sleep(project.delay);
    }

    if (project.errorRate > 0) {
      const random = Math.random() * 100;
      if (random < project.errorRate) {
        throw new NotFoundException('Simulated server error');
      }
    }

    const schemas = project.schemaJson as Record<string, ResourceSchema>;
    const schema = schemas?.[resource];

    if (!schema) {
      throw new NotFoundException(`Resource "${resource}" not found in schema`);
    }

    const fallbackLimit = project.defaultLimit > 0 ? project.defaultLimit : 20;
    const rawLimit =
      typeof query.limit === 'string' ? query.limit : String(fallbackLimit);
    const parsed = parseInt(rawLimit, 10);
    const limit =
      Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackLimit;
    const count = Math.min(limit, 100);

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
    if (prop.faker) {
      return this.getFakerValue(prop.faker, prop.fakerArgs);
    }

    if (prop.format === 'email') {
      return faker.internet.email();
    }
    if (prop.format === 'date-time' || prop.format === 'date') {
      return faker.date.recent().toISOString();
    }
    if (prop.format === 'uuid') {
      return faker.string.uuid();
    }

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

  private getFakerValue(path: string, args: unknown[] = []): unknown {
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
        throw new Error(`Unknown faker method: "${path}"`);
      }
    }

    if (typeof current === 'function') {
      return (current as (...a: unknown[]) => unknown)(...args);
    }

    return current;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
