import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { OAuth2Client } from 'google-auth-library';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { GitHubAuthDto } from './dto/github-auth.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';

// Интерфейсы для типизации ответов GitHub API
interface GitHubTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUserResponse {
  id: number;
  login: string;
  name?: string;
  avatar_url?: string;
  email?: string;
}

interface GitHubEmailResponse {
  email: string;
  primary: boolean;
  verified: boolean;
}

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private jwtService: JwtService,
  ) {
    this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

  // ==================== GOOGLE ====================
  async googleLogin(dto: GoogleAuthDto) {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) throw new UnauthorizedException('Invalid Google token');

      const { email, name, picture, sub } = payload;
      if (!email) throw new UnauthorizedException('Google email not found');

      let user = await this.userRepo.findOne({ where: { email } });

      if (!user) {
        user = this.userRepo.create({
          email,
          name: name || email.split('@')[0],
          avatar: picture || undefined, // Заменили null на undefined
          provider: 'google',
          providerId: sub,
        });
        await this.userRepo.save(user);
      }

      const token = this.generateToken(user);
      return { token, user: this.sanitizeUser(user) };
    } catch {
      throw new UnauthorizedException('Google authentication failed');
    }
  }

  // ==================== GITHUB ====================
  async githubLogin(dto: GitHubAuthDto) {
    try {
      // 1. Меняем code на access_token
      const tokenRes = await fetch(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            code: dto.code,
          }),
        },
      );

      const tokenData = (await tokenRes.json()) as GitHubTokenResponse;

      if (tokenData.error || !tokenData.access_token) {
        throw new UnauthorizedException(
          tokenData.error_description || 'Failed to obtain access token',
        );
      }

      const accessToken = tokenData.access_token;

      // 2. Получаем данные пользователя
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'mock-generator',
        },
      });
      const githubUser = (await userRes.json()) as GitHubUserResponse;

      // 3. Получаем email (может быть приватным)
      const emailRes = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'mock-generator',
        },
      });
      const emails = (await emailRes.json()) as GitHubEmailResponse[];

      const primaryEmail =
        emails.find((e) => e.primary)?.email || githubUser.email;

      if (!primaryEmail) {
        throw new UnauthorizedException('GitHub email not available');
      }

      let user = await this.userRepo.findOne({
        where: { email: primaryEmail },
      });

      if (!user) {
        user = this.userRepo.create({
          email: primaryEmail,
          name: githubUser.name || githubUser.login,
          avatar: githubUser.avatar_url || undefined, // Заменили null на undefined
          provider: 'github',
          providerId: String(githubUser.id),
        });
        await this.userRepo.save(user);
      }

      const token = this.generateToken(user);
      return { token, user: this.sanitizeUser(user) };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new UnauthorizedException(
        `GitHub authentication failed: ${message}`,
      );
    }
  }

  // ==================== HELPERS ====================
  private generateToken(user: User): string {
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      plan: user.plan,
    });
  }

  private sanitizeUser(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      plan: user.plan,
      maxProjects: user.maxProjects,
    };
  }

  async devLogin() {
    let user = await this.userRepo.findOne({
      where: { email: 'dev@test.com' },
    });

    if (!user) {
      user = this.userRepo.create({
        email: 'dev@test.com',
        name: 'Dev User',
        avatar: undefined,
        provider: 'dev',
        providerId: 'dev-123',
      });
      await this.userRepo.save(user);
    }

    const token = this.generateToken(user);
    return { token, user: this.sanitizeUser(user) };
  }
}
