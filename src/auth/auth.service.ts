import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { OAuth2Client } from 'google-auth-library';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { GitHubAuthDto } from './dto/github-auth.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';

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

      const user = await this.upsertOAuthUser({
        email,
        name: name || email.split('@')[0],
        avatar: picture,
        provider: 'google',
        providerId: sub,
      });

      const token = this.generateToken(user);
      return { token, user: this.sanitizeUser(user) };
    } catch {
      throw new UnauthorizedException('Google authentication failed');
    }
  }

  async githubLogin(dto: GitHubAuthDto) {
    try {
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

      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'mock-generator',
        },
      });
      const githubUser = (await userRes.json()) as GitHubUserResponse;

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

      const user = await this.upsertOAuthUser({
        email: primaryEmail,
        name: githubUser.name || githubUser.login,
        avatar: githubUser.avatar_url,
        provider: 'github',
        providerId: String(githubUser.id),
      });

      const token = this.generateToken(user);
      return { token, user: this.sanitizeUser(user) };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new UnauthorizedException(
        `GitHub authentication failed: ${message}`,
      );
    }
  }

  private async upsertOAuthUser(profile: {
    email: string;
    name: string;
    avatar?: string;
    provider: string;
    providerId: string;
  }): Promise<User> {
    let user = await this.userRepo.findOne({
      where: [
        { provider: profile.provider, providerId: profile.providerId },
        { email: profile.email },
      ],
    });

    if (!user) {
      user = this.userRepo.create({
        email: profile.email,
        name: profile.name,
        avatar: profile.avatar || undefined,
        provider: profile.provider,
        providerId: profile.providerId,
      });
    } else {
      user.email = profile.email;
      user.name = profile.name;
      if (profile.avatar) {
        user.avatar = profile.avatar;
      }
      user.provider = profile.provider;
      user.providerId = profile.providerId;
    }

    return this.userRepo.save(user);
  }

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
