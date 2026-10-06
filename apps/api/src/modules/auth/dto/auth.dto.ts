// ============================================================================
// FILE: /apps/api/src/modules/auth/dto/auth.dto.ts
// ============================================================================

import { IsEmail, IsString, MinLength, MaxLength, IsOptional, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  // Minimum 8 chars, at least one letter and one number.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'password must contain at least one letter and one number' })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(32)
  refreshToken: string;
}
