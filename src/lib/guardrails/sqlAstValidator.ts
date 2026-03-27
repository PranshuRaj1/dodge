/**
 * src/lib/guardrails/sqlAstValidator.ts
 * Layer G5 — Post-generation SQL structure validator (~0 ms).
 *
 * Runs on the SQL produced by the LLM BEFORE execution.
 * Blocks anything that isn't a straightforward single-table SELECT:
 *  - Set operations (UNION, INTERSECT, EXCEPT) — used in column-count attacks
 *  - CROSS JOIN / implicit multi-table joins — cartesian product DoS
 *  - PRAGMA — SQLite metadata/config commands
 *  - ATTACH / DETACH — database file access
 *  - SELECT INTO — write via SELECT
 *  - Anything that doesn't lead with SELECT after comment stripping
 */

export type SqlStructureResult =
  | { valid: true }
  | { valid: false; reason: string };

/** Strips SQL line comments and block comments for cleaner matching. */
function stripComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')       // line comments
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .trim();
}

const DISALLOWED_PATTERNS: Array<[RegExp, string]> = [
  [/\bUNION\b/i,                              'UNION operations are not permitted'],
  [/\bINTERSECT\b/i,                          'INTERSECT operations are not permitted'],
  [/\bEXCEPT\s+SELECT\b/i,                    'EXCEPT set operations are not permitted'],
  [/\bCROSS\s+JOIN\b/i,                       'CROSS JOIN is not permitted'],
  [/\bFROM\s+\w+\s*,\s*\w+[\s,]/i,           'Implicit multi-table joins are not permitted'],
  [/\bPRAGMA\b/i,                             'PRAGMA commands are not permitted'],
  [/\bATTACH\b/i,                             'ATTACH DATABASE is not permitted'],
  [/\bDETACH\b/i,                             'DETACH DATABASE is not permitted'],
  [/\bINTO\s+[a-zA-Z_]\w*/i,                 'SELECT INTO is not permitted'],
  [/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bALTER\b|\bCREATE\b|\bTRUNCATE\b/i,
                                               'Write operations are not permitted'],
];

/**
 * Returns `{ valid: true }` if the generated SQL is structurally safe to execute.
 * Returns `{ valid: false, reason }` if a disallowed construct is detected.
 */
export function validateSqlStructure(sql: string): SqlStructureResult {
  const clean = stripComments(sql);

  // Must start with SELECT
  if (!/^SELECT\b/i.test(clean)) {
    return { valid: false, reason: 'Only SELECT queries are permitted' };
  }

  for (const [pattern, reason] of DISALLOWED_PATTERNS) {
    if (pattern.test(clean)) {
      return { valid: false, reason };
    }
  }

  return { valid: true };
}
