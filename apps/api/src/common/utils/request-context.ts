// ============================================================================
// FILE: /apps/api/src/common/utils/request-context.ts
// ============================================================================
// The minimal slice of an HTTP request the audit trail needs.

export interface RequestContext {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}
