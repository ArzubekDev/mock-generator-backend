import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { User } from '../users/entities/user.entity'; // Импортируйте вашу сущность User
import { AuthService } from './auth.service';
import { GitHubAuthDto } from './dto/github-auth.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

// Создаем тип для запроса, где user строго типизирован
interface RequestWithUser extends ExpressRequest {
  user: User;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google')
  googleAuth(@Body() dto: GoogleAuthDto) {
    return this.authService.googleLogin(dto);
  }

  @Post('github')
  githubAuth(@Body() dto: GitHubAuthDto) {
    return this.authService.githubLogin(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: RequestWithUser) {
    // Заменили 'user: any' на четкий тип 'RequestWithUser'
    const user = req.user;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      plan: user.plan,
      maxProjects: user.maxProjects,
      projectsCount: user.projects?.length || 0,
    };
  }

  @Post('dev-login')
  devLogin() {
    return this.authService.devLogin();
  }
}
