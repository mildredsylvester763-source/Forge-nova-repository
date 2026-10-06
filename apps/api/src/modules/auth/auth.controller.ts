// ============================================================================
// FILE: /apps/api/src/modules/auth/auth.controller.ts
// ============================================================================

import {
  Controller,
  Get,
  Post,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AuthService, RequestMeta } from './auth.service';
import { RegisterDto, LoginDto, RefreshDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private meta(req: any): RequestMeta {
    return { ipAddress: req.ip, userAgent: req.headers?.['user-agent'] };
  }

  // ─── Email + password ──────────────────────────────────────────────────────
  @Public()
  @Post('register')
  register(@Request() req: any, @Body() dto: RegisterDto) {
    return this.authService.register(dto, this.meta(req));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Request() req: any, @Body() dto: LoginDto) {
    return this.authService.login(dto, this.meta(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Request() req: any, @Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken, this.meta(req));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refreshToken);
  }

  // ─── Google OAuth ───────────────────────────────────────────────────────────
  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth(): void {
    // Passport redirects the user to Google's consent screen.
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Request() req: any, @Res() res: Response): Promise<void> {
    const { user, tokens } = await this.authService.oauthLogin(req.user, t
his.meta(req));
    this.redirectWithTokens(res, tokens);
  }

  // ─── Facebook OAuth ────────────────────────────────────────────────────────
  @Public()
  @Get('facebook')
  @UseGuards(AuthGuard('facebook'))
  facebookAuth(): void {
    // Passport redirects the user to Facebook's consent screen.
  }

  @Public()
  @Get('facebook/callback')
  @UseGuards(AuthGuard('facebook'))
  async facebookCallback(@Request() req: any, @Res() res: Response): Promise<void> {
    const { user, tokens } = await this.authService.oauthLogin(req.user, this.meta(req));
    this.redirectWithTokens(res, tokens);
  }

  // ─── Me ────────────────────────────────────────────────────────────────────
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Request() req: any) {
    const { passwordHash: _p, providerProfile: _pr, ...safe } = req.user;
    return safe;
  }

  // For the SPA frontend: hand tokens back as a redirect to the client
  // with a short-lived authorization code, or fragment. In production this
  // becomes an HttpOnly-cookie set for the app domain (CSRF-safe).
  private redirectWithTokens(res: Response, tokens: { accessToken: string; refreshToken: string }): void {
    const clientUrl = process.env.CLIENT_URL || 'https://app.forge-nova.com';
    res.redirect(302, clientUrl + '/auth/callback#' +
      'access_token=' + encodeURIComponent(tokens.accessToken) + '&' +
      'refresh_token=' + encodeURIComponent(tokens.refreshToken));
  }
}
