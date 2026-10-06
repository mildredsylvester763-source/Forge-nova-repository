// ============================================================================
// FILE: /apps/api/src/common/guards/global-auth.guard.ts
// ============================================================================
// THE building-wide lock. Applied globally at boot: every route requires a
// valid, unexpired JWT belonging to an ACTIVE account — unless the route is
// explicitly marked @Public(). Controllers never opt in; security is the
// default and opting out is the audited exception.

import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class GlobalAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
