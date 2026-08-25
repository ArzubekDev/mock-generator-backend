import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { Project } from './entities/project.entity';
import { AiService } from '../ai/ai.service';
import { CreateProjectWithAiDto } from './dto/create-project-with-ai.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private aiService: AiService,
    private dataSource: DataSource,
  ) {}

  async create(userId: string, dto: CreateProjectDto) {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) throw new BadRequestException('User not found');

      const projectCount = await manager.count(Project, {
        where: { userId },
      });

      if (projectCount >= user.maxProjects) {
        throw new BadRequestException(
          `Лимит проектов: ${user.maxProjects}. Удалите старый проект, чтобы создать новый.`,
        );
      }

      const endpointKey = Math.random().toString(36).substring(2, 10);

      const project = manager.create(Project, {
        ...dto,
        userId,
        endpointKey,
      });

      return manager.save(project);
    });
  }

  async createWithAi(dto: CreateProjectWithAiDto, userId: string) {
    const schemaJson = await this.aiService.generateSchema(dto.prompt);

    if (
      !schemaJson ||
      typeof schemaJson !== 'object' ||
      Array.isArray(schemaJson)
    ) {
      throw new BadRequestException('AI вернул невалидную схему');
    }

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) throw new BadRequestException('User not found');

      const projectCount = await manager.count(Project, {
        where: { userId },
      });

      if (projectCount >= user.maxProjects) {
        throw new BadRequestException(
          `Лимит проектов: ${user.maxProjects}. Удалите старый проект, чтобы создать новый.`,
        );
      }

      const endpointKey = this.generateEndpointKey(dto.name);

      const project = manager.create(Project, {
        name: dto.name,
        endpointKey,
        schemaJson,
        delay: dto.delay ?? 0,
        errorRate: dto.errorRate ?? 0,
        defaultLimit: dto.defaultLimit ?? 20,
        userId,
      });

      const saved = await manager.save(project);

      return {
        success: true,
        data: saved,
        schema: schemaJson,
        redirectUrl: `/dashboard`,
        mockUrl: `/api/${saved.endpointKey}/${Object.keys(schemaJson)[0]}`,
      };
    });
  }

  async findAllByUser(userId: string) {
    if (!userId) {
      throw new BadRequestException('Query parameter "userId" is required');
    }

    return await this.projectRepo.find({ where: { userId } });
  }

  async findOne(id: string, userId: string) {
    const project = await this.projectRepo.findOne({
      where: { id },
      relations: { user: true },
    });

    if (!project) throw new NotFoundException('Project not found');
    if (project.userId !== userId)
      throw new UnauthorizedException('Not your project');

    return project;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    return this.projectRepo.delete(id);
  }

  private generateEndpointKey(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const suffix = Math.random().toString(36).substring(2, 8);
    return `${slug}-${suffix}`;
  }
}
