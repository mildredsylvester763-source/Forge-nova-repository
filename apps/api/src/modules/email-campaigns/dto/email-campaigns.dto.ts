import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SaveTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  subject: string;

  @IsArray()
  @ArrayMinSize(1)
  blocks: Record<string, unknown>[];
}

export class RenderTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  shopName?: string;
}

export class CreateCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  subject: string;

  @IsOptional()
  @IsString()
  templateId?: string;
}

export class RecordEventDto {
  @IsString()
  @MinLength(5)
  @MaxLength(254)
  email: string;

  @IsString()
  @MaxLength(20)
  eventType: string;
}
