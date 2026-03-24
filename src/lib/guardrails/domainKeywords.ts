/**
 * src/lib/guardrails/domainKeywords.ts
 * Layer 2 — O2C domain keyword allowlist (Set<string> lookup, ~0 ms).
 *
 * PURPOSE: Fast-path APPROVAL only. A miss here routes to Layer 3 (LLM classifier).
 * A miss does NOT mean reject. Err on the side of breadth — false negatives here
 * cost one extra Groq call; false positives (blocking real queries) are user-visible failures.
 */

export const DOMAIN_KEYWORDS = new Set<string>([
  // ── Core O2C entities ────────────────────────────────────────────────────
  'order', 'orders', 'salesorder', 'sales',
  'delivery', 'deliveries', 'shipment', 'shipments', 'dispatch', 'dispatched',
  'invoice', 'invoices', 'billing', 'billed', 'bill',
  'payment', 'payments', 'paid', 'settled', 'outstanding', 'overdue',
  'customer', 'customers', 'client', 'clients', 'buyer', 'buyers',
  'product', 'products', 'material', 'materials', 'item', 'items', 'sku',
  'journal', 'journals', 'entry', 'entries',

  // ── ERP / finance terms ───────────────────────────────────────────────────
  'gl', 'account', 'accounts', 'receivable', 'revenue', 'amount', 'amounts',
  'currency', 'inr', 'fiscal', 'posting', 'posted', 'transaction', 'transactions',
  'document', 'documents', 'ledger', 'ledgers', 'debit', 'credit',
  'reconciled', 'reconciliation', 'flow', 'trace',

  // ── Business process states ───────────────────────────────────────────────
  'fulfilled', 'pending', 'processed', 'incomplete', 'missing', 'broken',
  'open', 'closed', 'cancelled', 'rejected',


  // ── Query intent signals — NOT in fast-path ───────────────────────────────
  // Words like 'list', 'find', 'show', 'count', 'which', 'how', 'many',
  // 'highest', 'lowest', etc. are NOT O2C domain signals on their own.
  // Keeping them here caused "list all the tables" to bypass the LLM classifier.
  // They remain useful when accompanying a real domain entity (e.g. "list orders"),
  // but that will already match on the entity term.
]);

const SPLIT_RE = /[\s,?!.:;()+\-/*]+/;

/**
 * Returns `true` if the query contains at least one O2C domain keyword.
 * If `false`, the caller should escalate to Layer 3 (LLM classifier).
 */
export function hasDomainKeyword(text: string): boolean {
  const tokens = text.toLowerCase().split(SPLIT_RE);
  return tokens.some(token => token.length > 0 && DOMAIN_KEYWORDS.has(token));
}
