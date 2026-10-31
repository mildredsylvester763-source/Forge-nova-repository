// ============================================================================
// FILE: /apps/api/src/modules/websites/dto/websites.dto.ts
// ============================================================================

import { ArrayMinSize, IsArray, IsString, MinLength } from 'class-validator';
import { PageBlock } from '../engine/website-engine';

export class CreateSiteDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  template: string;
}

export class CreatePageDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @MinLength(1)
  slug: string;

  @IsArray()
  @ArrayMinSize(1)
  blocks: PageBlock[];
}

export class AddDomainDto {
  @IsString()
  @MinLength(1)
  domain: string;
}

export class VerifyDomainDto {
  @IsString()
  @MinLength(1)
  txtValue: string;
}
