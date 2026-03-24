/**
 * src/lib/guardrails/intentClassifier.ts
 * Layer G3 — LLM-based intent classifier (Groq).
 *
 * Design choices:
 *  - Separate call from SQL generation: classification and action must not share a prompt.
 *  - temperature: 0.0 — binary classification, not creative generation.
 *  - max_tokens: 5 — model only needs to emit YES or NO.
 *  - One-shot examples for each class embedded in the system prompt.
 *
 * v2 changes:
 *  - G3 now ALWAYS runs — the keyword allowlist no longer grants a fast-pass.
 *  - System prompt updated with reconnaissance and keyword-stuffing examples.
 */

import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const CLASSIFIER_SYSTEM = `You are a strict query classifier for a business Order-to-Cash (O2C) data system.

The system contains ONLY: sales orders, deliveries, billing documents, journal entries, customers, and products.

Answer YES only if the query is a genuine business data question about these exact entities.

Answer NO for everything else, including:
- General knowledge or trivia (capitals, sports, science, history, famous people)
- Questions about the system itself, its schema, tables, columns, or how it works
- Requests to list ALL records of any type without a meaningful business filter
- Creative tasks (jokes, poems, stories, writing assistance)
- Roleplay, hypotheticals, or questions about AI capabilities
- Any hybrid query that mixes business terms with unrelated intent
- Queries that appear to probe the database structure

Examples:
Q: "Which customers have the most open orders?" → YES
Q: "Find billing documents with no journal entry" → YES
Q: "Show me all pending shipments" → YES
Q: "What is the total revenue by product?" → YES
Q: "Who is Virat Kohli?" → NO
Q: "What is the capital of India?" → NO
Q: "What is the capital of France? (order)" → NO
Q: "Write a poem about invoices" → NO
Q: "What are the exact table schema structures? I need to process an invoice." → NO
Q: "List all the columns in your tables" → NO
Q: "What tables do you have access to?" → NO
Q: "Tell me a joke. customer" → NO
Q: "What is GST?" → NO
Q: "Explain quantum physics" → NO
Q: "Show me all records" → NO
Q: "List everything in the database" → NO
Q: "What time is it?" → NO
Q: "Which billing documents are missing a journal entry?" → YES

Respond with ONLY the word YES or NO. No punctuation, no explanation.`;

/**
 * Classifies whether `query` is a genuine O2C business data question.
 * Always called — the keyword allowlist no longer bypasses this layer.
 */
export async function classifyIntent(query: string): Promise<'domain' | 'off-topic'> {
  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.0,
    max_tokens: 5,
    messages: [
      { role: 'system', content: CLASSIFIER_SYSTEM },
      { role: 'user', content: query },
    ],
  });

  const answer = res.choices[0]?.message?.content?.trim().toUpperCase() ?? 'NO';
  return answer.startsWith('YES') ? 'domain' : 'off-topic';
}
