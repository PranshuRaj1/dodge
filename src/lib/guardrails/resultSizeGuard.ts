/**
 * src/lib/guardrails/resultSizeGuard.ts
 * Layer G7 — Query result size limiter.
 *
 * Two-part protection against resource exhaustion / server crashes:
 *
 * Part 1 — enforceLimitClause(sql)
 *   Strips any LLM-generated LIMIT clause and injects LIMIT 100.
 *   Runs BEFORE execution. Always unconditional — never trust the model's limit.
 *
 * Part 2 — checkResultSize(rows)
 *   After execution, checks the total JSON-serialized byte size of the result.
 *   If it exceeds 500 KB, truncates row-by-row and returns a safe subset.
 *   This is the backstop that prevents `RangeError: Invalid string length`
 *   from crashing the Next.js API route.
 */

const MAX_ROWS = 100;
const MAX_BYTES = 500_000; // 500 KB ceiling before JSON.stringify

/**
 * Strips any existing LIMIT clause from `sql` and appends `LIMIT <MAX_ROWS>`.
 * Trailing semicolons are also stripped to allow clean appending.
 */
export function enforceLimitClause(sql: string): string {
  const stripped = sql
    .replace(/\bLIMIT\s+\d+(\s+OFFSET\s+\d+)?\s*/gi, '') // strip existing LIMIT
    .replace(/;\s*$/, '')                                    // strip trailing semicolon
    .trimEnd();
  return `${stripped} LIMIT ${MAX_ROWS}`;
}

export type SizeGuardResult =
  | { truncated: false; rows: Record<string, unknown>[] }
  | { truncated: true; rows: Record<string, unknown>[]; originalCount: number };

/**
 * Returns a safe subset of `rows` that fits within MAX_BYTES when JSON-serialized.
 * If the full result fits, returns it unchanged with `truncated: false`.
 * Otherwise truncates row-by-row and returns `truncated: true`.
 */
export function checkResultSize(rows: Record<string, unknown>[]): SizeGuardResult {
  // Fast path: estimate first (avoids full serialization for typical small results)
  const full = JSON.stringify(rows);
  if (full.length <= MAX_BYTES) {
    return { truncated: false, rows };
  }

  // Truncate row-by-row until it fits
  const safe: Record<string, unknown>[] = [];
  for (const row of rows) {
    safe.push(row);
    if (JSON.stringify(safe).length > MAX_BYTES) {
      safe.pop();
      break;
    }
  }

  return { truncated: true, rows: safe, originalCount: rows.length };
}
