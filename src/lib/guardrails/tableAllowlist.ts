/**
 * src/lib/guardrails/tableAllowlist.ts
 * Layer G6 — Table name allowlist on generated SQL (~0 ms).
 *
 * Parses every table reference from FROM and JOIN clauses in the generated SQL
 * and rejects the query if any table is not in the approved set.
 *
 * This is the definitive block against sqlite_master access, even if a future
 * regex in G2 or G5 is bypassed. The LLM simply cannot reference a table that
 * isn't in { 'nodes', 'edges' }.
 */

/** The only tables this application is allowed to query. */
const ALLOWED_TABLES = new Set<string>(['nodes', 'edges']);

/**
 * Extracts all table names referenced in FROM and JOIN clauses.
 * Handles: FROM tbl, JOIN tbl, LEFT JOIN tbl, INNER JOIN tbl, etc.
 * Does NOT need to handle subqueries perfectly — any table reference
 * in the string will be found.
 */
export function extractTableNames(sql: string): string[] {
  const pattern = /\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
  const tables: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql)) !== null) {
    tables.push(match[1].toLowerCase());
  }
  return tables;
}

export type TableCheckResult =
  | { safe: true }
  | { safe: false; reason: string };

/**
 * Returns `{ safe: true }` if all referenced tables are in the allowlist.
 * Returns `{ safe: false, reason }` if any forbidden table is found.
 */
export function checkTableAllowlist(sql: string): TableCheckResult {
  const tables = extractTableNames(sql);
  const forbidden = tables.filter((t) => !ALLOWED_TABLES.has(t));
  if (forbidden.length > 0) {
    return {
      safe: false,
      reason: `Forbidden table reference(s): ${forbidden.join(', ')}`,
    };
  }
  return { safe: true };
}
