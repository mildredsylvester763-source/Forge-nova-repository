// ============================================================================
// FILE: /apps/api/src/modules/agent/engine/agent-command.ts
// ============================================================================

// Command normalization strips filler words (never silently rewrites
// meaning), then intent classification maps the cleaned text onto the
// pinned intent set. Anything that matches no rule is a named refusal —
// the agent never guesses what the user meant.

export type Verdict<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface NormalizedCommand {
  text: string;
  fillerRemoved: number;
}

export interface ClassifiedIntent {
  intent: string;
  confidence: number;
}

const FILLERS: ReadonlySet<string> = new Set([
  'please', 'kindly', 'could', 'would', 'you', 'can', 'hi', 'hello', 'hey',
  'okay', 'ok', 'just', 'maybe', 'the',
]);

interface IntentRule {
  intent: string;
  confidence: number;
  test: RegExp;
}

const INTENT_RULES: IntentRule[] = [
  { intent: 'report.cashflow', confidence: 0.9, test: /\bcash\s*flow\b|\bforecast\b/ },
  { intent: 'report.weekly', confidence: 0.8, test: /\bweekly\b|\bweek\s+report\b|\bsummary\b/ },
  { intent: 'payment.record', confidence: 0.8, test: /\bpaid\b|\bpayment\b|\breceived\b|\bcollect(ed)?\b/ },
  { intent: 'invoice.create', confidence: 0.8, test: /\binvoice\b|\bbill\b|\bquote\b/ },
  { intent: 'expense.create', confidence: 0.7, test: /\bexpense\b|\bspent\b/ },
  { intent: 'contact.search', confidence: 0.7, test: /\bcontact\b|\bcustomer\b|\bfind\b|\bsearch\b/ },
];

export function normalizeCommand(input: string): Verdict<NormalizedCommand> {
  if (typeof input !== 'string') return { ok: false, reason: 'command-not-a-string' };
  if (!input.trim()) return { ok: false, reason: 'command-empty' };
  const tokens = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  let fillerRemoved = 0;
  const kept: string[] = [];
  for (const token of tokens) {
    if (FILLERS.has(token)) {
      fillerRemoved += 1;
      continue;
    }
    kept.push(token);
  }
  if (!kept.length) return { ok: false, reason: 'command-only-filler' };
  return { ok: true, value: { text: kept.join(' '), fillerRemoved } };
}

export function classifyIntent(text: string): Verdict<ClassifiedIntent> {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'intent-empty' };
  for (const rule of INTENT_RULES) {
    if (rule.test.test(text)) {
      return { ok: true, value: { intent: rule.intent, confidence: rule.confidence } };
    }
  }
  return { ok: false, reason: 'intent-unclear' };
}
