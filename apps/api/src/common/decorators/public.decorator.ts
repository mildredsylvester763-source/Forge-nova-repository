// ============================================================================
// FILE: /apps/api/src/common/decorators/public.decorator.ts
// ============================================================================
// Marks a route as reachable without a JWT. Every route is PRIVATE by
// default (global guard); only routes carrying @Public() are open —
// and that list is exactly: register, login, OAuth entry + callbacks,
// refresh. Anything new must be explicitly justified.

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
