import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertBirthdayDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name: string;

  @IsString()
  @MinLength(5)
  @MaxLength(5)
  birthMonthDay: string;
}
