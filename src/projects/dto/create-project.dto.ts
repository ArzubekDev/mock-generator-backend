import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  name: string;

  @IsObject()
  schemaJson: any;

  @IsOptional()
  @IsNumber()
  delay?: number;

  @IsOptional()
  @IsNumber()
  errorRate?: number;
}
