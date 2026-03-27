/**
 * src/lib/guardrails/sqlFragmentDetector.ts
 * Layer G2 — SQL fragment detector on raw user input.
 *
 * Blocks SQL injection patterns embedded in natural language BEFORE the query
 * ever reaches the LLM. Runs in ~0 ms via regex.
 *
 * Legitimate business questions will never contain UNION ALL SELECT,
 * OR 1=1, sqlite_master references, or comment terminators.
 */

const SQL_FRAGMENT_PATTERNS: RegExp[] = [
  // Set operations — never needed in NL business questions
  /\bUNION\s+(ALL\s+)?SELECT\b/i,
  /\bINTERSECT\s+SELECT\b/i,

  // Full SELECT ... FROM inside the user question
  /\bSELECT\b[\s\S]{1,200}\bFROM\b/i,

  // Boolean injection patterns
  /\bOR\s+1\s*=\s*1/i,
  /\bOR\s+'\w+'\s*=\s*'\w+'/i,
  /\bAND\s+1\s*=\s*1/i,
  /\bAND\s+'\w+'\s*=\s*'\w+'/i,

  // SQL comment terminators
  /;?\s*--[ \t]*\w/,                    // inline comment
  /\/\*[\s\S]*?\*\//,            // block comment

  // Multi-statement injection
  /;\s*\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|ATTACH|PRAGMA)\b/i,

  // Direct schema probes
  /\bsqlite_master\b/i,
  /\bsqlite_schema\b/i,
  /\bINFORMATION_SCHEMA\b/i,
  /\bsys\.tables\b/i,

  // SQLite dangerous commands
  /\bPRAGMA\b/i,
  /\bATTACH\s+DATABASE\b/i,
  /\bDETACH\b/i,

  // Encoding/obfuscation bypasses
  /\bCHAR\s*\(\s*\d+/i,          // CHAR(39) etc.
  /0x[0-9a-f]{2,}/i,             // Hex literals in query

  // Write operations in user text
  /\b(DROP|DELETE|INSERT\s+INTO|UPDATE\s+\w+\s+SET|TRUNCATE|REPLACE\s+INTO)\b/i,
];

/**
 * Returns `true` if the raw user input contains embedded SQL fragments or
 * injection patterns. Should cause an immediate reject before the LLM is called.
 */
export function containsSqlFragment(input: string): boolean {
  return SQL_FRAGMENT_PATTERNS.some((p) => p.test(input));
}
