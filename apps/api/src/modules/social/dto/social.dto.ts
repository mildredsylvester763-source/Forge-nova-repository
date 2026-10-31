import { ArrayMinSize, IsArray, IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateSocialPostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(63206)
  text: string;

  @IsArray()
  @ArrayMinSize(1)
  platforms: string[];

  @IsInt()
  @Min(0)
  scheduledAtMs: number;
}
