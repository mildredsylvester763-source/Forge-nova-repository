import { Type } from 'class-transformer';

export class TargetAudienceDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => DemographicsDto)
  demographics?: DemographicsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PsychographicsDto)
  psychographics?: PsychographicsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeographicsDto)
  geographics?: GeographicsDto;
}

// DTO 2: DemographicsDto

export class DemographicsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ageRange?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  gender?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  incomeLevel?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  education?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  location?: string[];
}

// DTO 3: PsychographicsDto

export class PsychographicsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  values?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lifestyle?: string[];
}

// DTO 4: GeographicsDto

export class GeographicsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countries?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  regions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cities?: string[];
}

// DTO 5: CompetitorDto
