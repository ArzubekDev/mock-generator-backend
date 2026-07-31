import { IsString } from 'class-validator';

export class GitHubAuthDto {
  @IsString()
  code: string;
}
