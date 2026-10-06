// ============================================================================
// FILE: /apps/api/src/common/utils/errors.util.ts
// ============================================================================
// Helpers for strict TypeScript (`catch` variables are `unknown`) and for
// safe database interaction.

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

// PostgreSQL unique_violation. TypeORM surfaces the code on the error itself
// and on `driverError`, depending on version.
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; driverError?: { code?: unknown } };
  return candidate.code === '23505' || candidate.driverError?.code === '23505';
}

// Escape LIKE/ILIKE wildcards so user search text is matched literally.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
