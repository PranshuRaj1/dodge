/**
 * src/lib/guardrails/jailbreakDetector.ts
 * Layer G1 — Regex-based jailbreak / prompt-injection detector.
 *
 * Intentionally uses regex (not LLM) so the attack has no LLM surface to exploit.
 * Runs in ~0 ms before any network call.
 *
 * Improvement over v1: synonym normalization pass runs before regex matching,
 * so paraphrases like "discard your directives" or "assume the persona of"
 * are canonicalized to forms the regex already catches.
 */

// ── Synonym normalization ─────────────────────────────────────────────────────
// Maps attacker paraphrases to the canonical forms matched by INJECTION_PATTERNS.
const SYNONYM_MAP: Array<[RegExp, string]> = [
  [/\bdiscard\b/gi,              'ignore'],
  [/\bcircumvent\b/gi,           'bypass'],
  [/\boverride\b/gi,             'ignore'],
  [/\bset\s+aside\b/gi,          'ignore'],
  [/\bno\s+longer\s+follow\b/gi, 'ignore'],
  [/\bforget\s+about\b/gi,       'forget'],
  [/\bbehave\s+as\b/gi,          'act as'],
  [/\bassume\s+the\s+persona\s+of\b/gi, 'act as'],
  [/\bpretend\s+to\s+be\b/gi,    'act as'],
  [/\bact\s+like\b/gi,           'act as'],
];

function normalizeForDetection(text: string): string {
  let normalized = text.toLowerCase();
  for (const [pattern, replacement] of SYNONYM_MAP) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}

// ── Injection patterns ────────────────────────────────────────────────────────
const INJECTION_PATTERNS: RegExp[] = [
  // Instruction override
  /ignore\s+(your\s+)?(previous\s+|all\s+)?instructions/i,
  /ignore\s+(your\s+)?(previous\s+|all\s+)?directives/i,
  /forget\s+(everything|your\s+rules|your\s+system)/i,
  /bypass\s+(your\s+)?(safety|restrictions|rules|filters|guardrails)/i,
  /reveal\s+your\s+(system\s+)?prompt/i,
  /disregard\s+(your\s+)?(previous\s+|all\s+)?instructions/i,

  // Persona / role-play attacks
  /act\s+as\s+(a\s+)?(different|new|another|unrestricted|free)/i,
  /you\s+are\s+now\s+/i,
  /pretend\s+(you\s+)?(have\s+no|are\s+a\s+different)/i,
  /let'?s\s+play\s+a?\s+game/i,
  /you\s+are\s+["'`]?\w+["'`]?\s*,?\s*(an?\s+ai|a\s+bot)/i,
  /an?\s+ai\s+that\s+(always|never|only)\s+does\s+the\s+opposite/i,
  /does\s+the\s+opposite\s+of\s+what/i,
  /roleplay\s+as/i,
  /role\s*-?\s*play/i,
  /stay\s+in\s+character/i,

  // Known jailbreak shorthands
  /\bDAN\s+mode\b/i,
  /\bjailbreak\b/i,
  /system\s*prompt\s*:/i,

  // LLM-specific injection tokens (LLaMA, ChatML, etc.)
  /\[INST\]|\[\/INST\]/,
  /<\|system\|>/i,
  /###\s*(instruction|system)/i,
  /<\|im_start\|>/i,
];

/**
 * Returns `true` if the text matches known jailbreak / prompt-injection patterns
 * after synonym normalization.
 */
export function isJailbreakAttempt(text: string): boolean {
  const normalized = normalizeForDetection(text);
  return INJECTION_PATTERNS.some((pattern) => pattern.test(normalized));
}
