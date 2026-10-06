// ============================================================================
// FILE: /apps/api/src/common/transformers/decimal.transformer.ts
// ============================================================================
// PostgreSQL returns DECIMAL/NUMERIC columns as strings. Without this
// transformer, `total += row.score` concatenates text and `old !== new`
// comparisons are always true. Every decimal column uses it.

import { ValueTransformer } from 'typeorm';

export const decimalTransformer: ValueTransformer = {
  to: (value: number | null | undefined): number | null | undefined => value,
  from: (value: string | number | null | undefined): number | null | undefined => {
    if (value === null || value === undefined) return value;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  },
};
