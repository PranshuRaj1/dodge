/**
 * src/lib/guardrails/index.ts
 * Unified entry point — composes all guardrail layers.
 *
 * Input pipeline (G0 → G3) — runs before SQL generation:
 *   G0: Length check
 *   G1: Jailbreak regex + synonym normalization
 *   G2: SQL fragment detection in raw input
 *   G3: LLM intent classifier — ALWAYS runs, no keyword fast-path bypass
 *
 * SQL pipeline (G5 → G7) — runs after SQL generation:
 *   G4: checkSqlSafety (write-op / dangerous-function check) — unchanged
 *   G5: validateSqlStructure (UNION, CROSS JOIN, PRAGMA, etc.)
 *   G6: checkTableAllowlist (only nodes, edges)
 *   G7: enforceLimitClause + checkResultSize (size guard)
 *   These are exported directly from their modules and called in queryEngine.ts.
 */

import { isJailbreakAttempt } from './jailbreakDetector';
import { containsSqlFragment } from './sqlFragmentDetector';
import { classifyIntent } from './intentClassifier';

export { checkSqlSafety } from './sqlSanitizer';
export type { SqlCheckResult } from './sqlSanitizer';
export { validateSqlStructure } from './sqlAstValidator';
export type { SqlStructureResult } from './sqlAstValidator';
export { checkTableAllowlist } from './tableAllowlist';
export type { TableCheckResult } from './tableAllowlist';
export { enforceLimitClause, checkResultSize } from './resultSizeGuard';
export type { SizeGuardResult } from './resultSizeGuard';

export const REJECTION_MESSAGE =
  'This system is designed to answer questions related to the provided dataset only.';

export type GuardrailResult =
  | { pass: true }
  | { pass: false; message: string };

/** Maximum allowed query length in characters. */
const MAX_QUERY_LENGTH = 500;

/**
 * Runs the four input guardrail layers in order.
 *
 * G0 — Length check              (~0 ms, always runs)
 * G1 — Jailbreak regex           (~0 ms, always runs)
 * G2 — SQL fragment detection    (~0 ms, always runs)
 * G3 — LLM intent classifier     (Groq call, ALWAYS runs — no keyword bypass)
 *
 * Returns `{ pass: true }` if the query should proceed to SQL generation.
 * Returns `{ pass: false, message }` if it should be rejected.
 */
export async function checkInputGuardrails(query: string): Promise<GuardrailResult> {
  const trimmed = query.trim();

  // G0 — Empty or excessively long input
  if (trimmed.length === 0 || trimmed.length > MAX_QUERY_LENGTH) {
    return { pass: false, message: REJECTION_MESSAGE };
  }

  // G1 — Jailbreak / prompt injection (with synonym normalization)
  if (isJailbreakAttempt(trimmed)) {
    return { pass: false, message: REJECTION_MESSAGE };
  }

  // G2 — SQL fragments embedded in the raw user input
  if (containsSqlFragment(trimmed)) {
    return { pass: false, message: REJECTION_MESSAGE };
  }

  // G3 — LLM intent classifier (always runs — no keyword fast-path)
  const intent = await classifyIntent(trimmed);
  if (intent === 'off-topic') {
    return { pass: false, message: REJECTION_MESSAGE };
  }

  return { pass: true };
}
