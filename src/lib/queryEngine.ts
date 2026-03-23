/**
 * src/lib/queryEngine.ts
 * Natural Language → SQL → Naturalized Answer via Groq.
 */

import Groq from 'groq-sdk';
import getDb from './db';
import { getSchemaContext } from './schemaRegistry';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = 'llama-3.3-70b-versatile';

// Blocked SQL patterns (write operations)
const WRITE_PATTERN = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|REPLACE|ATTACH|DETACH)\b/i;

// Natural-language intent patterns that clearly express destructive intent
const DESTRUCTIVE_INTENT = /\b(delete|remove|drop|truncate|destroy|wipe|erase|clear)\b.{0,30}\b(all|every|nodes?|edges?|records?|data|rows?|tables?)\b/i;

export interface QueryResult {
  answer: string;
  sql: string;
  rows: unknown[];
  rowCount: number;
  error?: string;
}

export async function ask(question: string): Promise<QueryResult> {
  const schema = getSchemaContext();

  // ── Pre-check: block clearly destructive intent ───────────────────────────
  if (DESTRUCTIVE_INTENT.test(question)) {
    return {
      answer: "⚠️ That request appears to involve a destructive operation. I only support read-only queries against this database.",
      sql: '',
      rows: [],
      rowCount: 0,
      error: 'Destructive intent blocked',
    };
  }

  const sqlCompletion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 512,
    messages: [
      {
        role: 'system',
        content: `You are a SQLite query expert for a Supply Chain Order-to-Cash graph database.
Your ONLY job is to output a single valid SQLite SELECT query — nothing else.
Do NOT include markdown code fences, explanations, or multiple queries.
Only output the raw SQL starting with SELECT.

${schema.summary}`,
      },
      {
        role: 'user',
        content: `Write a SQLite SELECT query to answer: "${question}"`,
      },
    ],
  });

  let sql = sqlCompletion.choices[0]?.message?.content?.trim() ?? '';

  // Strip markdown code fences if the model adds them anyway
  sql = sql.replace(/^```(?:sql)?\n?/i, '').replace(/\n?```$/, '').trim();

  // Guard: must be SELECT only
  if (!sql.toLowerCase().startsWith('select')) {
    return {
      answer: "I can only run SELECT queries. Please ask a read-only question about the data.",
      sql,
      rows: [],
      rowCount: 0,
      error: 'Non-SELECT query rejected',
    };
  }

  if (WRITE_PATTERN.test(sql)) {
    return {
      answer: "That query contains write operations which are not permitted.",
      sql,
      rows: [],
      rowCount: 0,
      error: 'Write operation blocked',
    };
  }

  // ── Step 2: Execute SQL ───────────────────────────────────────────────────
  let rows: unknown[] = [];
  try {
    const db = getDb();
    rows = db.prepare(sql).all();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      answer: `I generated a query but it failed to execute: ${msg}`,
      sql,
      rows: [],
      rowCount: 0,
      error: msg,
    };
  }

  // ── Step 3: Naturalize Result ─────────────────────────────────────────────
  const naturalCompletion = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    max_tokens: 512,
    messages: [
      {
        role: 'system',
        content: `You are a helpful business analyst. Summarize SQL query results in clear, concise natural language.
Be specific with numbers, names, and IDs. Keep the answer to 2-3 sentences maximum.`,
      },
      {
        role: 'user',
        content: `Question: "${question}"
SQL: ${sql}
Results (${rows.length} rows): ${JSON.stringify(rows.slice(0, 20))}

Answer in natural language:`,
      },
    ],
  });

  const answer = naturalCompletion.choices[0]?.message?.content?.trim()
    ?? 'No answer could be generated.';

  return { answer, sql, rows, rowCount: rows.length };
}
