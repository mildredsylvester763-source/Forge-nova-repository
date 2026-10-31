import { IsString, MaxLength, MinLength } from 'class-validator';

export class OpenPortalSessionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(254)
  customerEmail: string;
}
