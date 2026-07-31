import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { Project } from './entities/project.entity';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private projectRepo: Repository<Project>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async create(userId: string, dto: CreateProjectDto) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: { projects: true },
    });

    if (!user) throw new BadRequestException('User not found');

    if (user.projects.length >= user.maxProjects) {
      throw new BadRequestException(
        `Лимит проектов: ${user.maxProjects}. Удалите старый проект, чтобы создать новый.`,
      );
    }

    const endpointKey = Math.random().toString(36).substring(2, 10);

    const project = this.projectRepo.create({
      ...dto,
      userId,
      endpointKey,
    });

    return this.projectRepo.save(project);
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
}
