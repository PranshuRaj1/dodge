/**
 * src/lib/guardrails/sqlSanitizer.ts
 * Layer 4 — SQL write-op and dangerous-function blocker (~0 ms).
 *
 * This is a defence-in-depth check that runs on the GENERATED SQL, after
 * all input guardrails have passed. It is non-negotiable — it runs on every query.
 */

/** Matches any DML/DDL write keyword as a whole word, case-insensitive. */
const WRITE_PATTERN =
  /\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|REPLACE|ATTACH|DETACH)\b/i;

/** Matches dangerous SQLite-specific functions. */
const DANGEROUS_FUNCTIONS = /\b(load_extension|readfile|writefile)\b/i;

export type SqlCheckResult =
  | { safe: true }
  | { safe: false; reason: string };

/**
 * Returns `{ safe: true }` if the SQL is safe to execute.
 * Returns `{ safe: false, reason }` if a write or dangerous operation is detected.
 */
export function checkSqlSafety(sql: string): SqlCheckResult {
  if (WRITE_PATTERN.test(sql)) {
    return { safe: false, reason: 'Write operation detected in generated SQL' };
  }
  if (DANGEROUS_FUNCTIONS.test(sql)) {
    return { safe: false, reason: 'Dangerous SQLite function detected in generated SQL' };
  }
  return { safe: true };
}
