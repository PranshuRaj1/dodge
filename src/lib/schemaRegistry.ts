/**
 * src/lib/schemaRegistry.ts
 * Introspects PostgreSQL and returns a compact schema string for the LLM.
 */

import getDb from './db';

export interface SchemaContext {
  nodeLabels: { label: string; count: number }[];
  edgeTypes:  { type: string; count: number }[];
  summary: string;
}

let _cache: SchemaContext | null = null;

export async function getSchemaContext(): Promise<SchemaContext> {
  if (_cache) return _cache;

  const db = getDb();

  const nodeLabels = await db`SELECT label, COUNT(*)::int as count, MAX(props::text) as sampleProps FROM nodes GROUP BY label ORDER BY count DESC` as { label: string; count: number; sampleProps: string }[];

  const edgeTypes = await db`SELECT type, COUNT(*)::int as count FROM edges GROUP BY type ORDER BY count DESC` as { type: string; count: number }[];

  const totalNodes = nodeLabels.reduce((s, r) => s + r.count, 0);
  const totalEdges = edgeTypes.reduce((s, r) => s + r.count, 0);

  const nodeLines = nodeLabels
    .map(r => {
      let keys = '';
      try {
        if (r.sampleProps) {
          keys = Object.keys(JSON.parse(r.sampleProps)).join(', ');
        }
      } catch {}
      return `  - ${r.label} (${r.count} records). Available JSON props: [${keys}]`;
    })
    .join('\n');
  const edgeLines = edgeTypes
    .map(r => `  - ${r.type} (${r.count} relationships)`)
    .join('\n');

  const summary = `
PostgreSQL graph database with ${totalNodes} nodes and ${totalEdges} edges.

DATABASE SCHEMA:
Table: nodes
  Columns: id (TEXT PK), label (TEXT), props (JSONB)

Table: edges
  Columns: id (TEXT PK), src (TEXT), dst (TEXT), type (TEXT), props (JSONB)

NODE LABELS (node type is stored in the \`label\` column):
${nodeLines}

EDGE TYPES (relationship type is stored in the \`type\` column):
${edgeLines}

IMPORTANT QUERY NOTES:
- To filter nodes by type, use: WHERE label = 'SalesOrder'
- Product display name is stored in props->>'description', NOT props->>'name'. Always use props->>'description' for product names.
- Node properties are in the \`props\` JSONB column. Use props->>'fieldName' to access fields.
- IMPORTANT: If you do not know the exact JSON property key, DO NOT guess it. Instead, SELECT the entire \`props\` column (e.g., \`SELECT props FROM nodes WHERE...\`) so you can read all available fields in the result.
- Common node ID prefixes (in the \`id\` column): SO- (SalesOrder), SOI- (SalesOrderItem), DEL- (Delivery), BILL- (BillingDocument), CUST- (Customer), PROD- (Product), JE- (JournalEntry), PAY- (Payment)
- HUGE IMPORTANT RULE: Users will often ask about raw SAP numbers like '740508' or '91150187' without the prefix. Do NOT assume the prefix. Instead, search the \`id\` column using LIKE '%740508%' OR search the JSONB properties using props->>'salesOrder' = '740508', props->>'billingDocument' = '91150187', etc.
- Example edge traversal: SELECT n2.* FROM nodes n1 JOIN edges e ON n1.id = e.src JOIN nodes n2 ON e.dst = n2.id WHERE n1.label='SalesOrder' AND e.type='ORDERED_BY'
- To find customer orders: join nodes on edges where type = 'ORDERED_BY'
- NEVER reverse edge directions. src and dst are fixed. Always join ON e.dst = node.id when the node is the destination, and ON e.src = node.id when the node is the source.

KEY RELATIONSHIP PATTERNS:
1. Finding journal entry number linked to a billing document number (e.g. '90504273'):
   JournalEntry nodes have a 'referenceDocument' prop that stores the billing document number.
   The journal entry number itself is stored in the 'accountingDocument' prop of JournalEntry nodes.
   CORRECT QUERY:
   SELECT DISTINCT props->>'accountingDocument' AS journalEntryNumber
   FROM nodes
   WHERE label = 'JournalEntry'
     AND props->>'referenceDocument' = '90504273';
   
   This is the PREFERRED way to find the accounting document / journal entry linked to any billing doc.
   Do NOT use edge traversal with POSTS_TO — use this direct prop lookup instead.

2. EDGE DIRECTIONS (CRITICAL — always use exactly these directions, never reverse them):
   - SalesOrder   → ORDERED_BY   → Customer        (SO is src,  CUST is dst)
   - SalesOrder   → DELIVERED_BY → Delivery         (SO is src,  DEL is dst)
   - SalesOrder   → HAS_ITEM     → SalesOrderItem   (SO is src,  SOI is dst)
     Forward:  JOIN edges e ON e.src = so.id  AND e.type = 'HAS_ITEM' → soi.id = e.dst
     Backward: JOIN edges e ON e.dst = soi.id AND e.type = 'HAS_ITEM' → so.id  = e.src
     WARNING: SalesOrderItem has NO direct edge to Delivery. Always go back through SalesOrder first.
   - SalesOrderItem → CONTAINS   → Product          (SOI is src, PROD is dst)
   - Delivery     → BILLED_IN    → BillingDocument  (DEL is src, BILL is dst)

3. Full O2C chain traversal (Sales Order → Delivery → Billing → Journal Entry):
   SO → DELIVERED_BY → DEL → BILLED_IN → BILL
   JournalEntry nodes link to billing docs via: props->>'referenceDocument' = billingDocNumber

4. Products associated with billing documents (CRITICAL — use this exact pattern):
   The graph branches from SalesOrder: one branch goes to SalesOrderItem→Product,
   another branch goes to Delivery→BillingDocument. Both branches share the same SalesOrder.
   Always fan out from SalesOrder — never try to chain SalesOrderItem directly to Delivery.

   SELECT prod.id, prod.props->>'description' AS product_name, COUNT(DISTINCT bill.id) AS billing_document_count
   FROM nodes so
   JOIN edges e1 ON e1.src = so.id AND e1.type = 'HAS_ITEM'
   JOIN nodes soi ON soi.id = e1.dst AND soi.label = 'SalesOrderItem'
   JOIN edges e2 ON e2.src = soi.id AND e2.type = 'CONTAINS'
   JOIN nodes prod ON prod.id = e2.dst AND prod.label = 'Product'
   JOIN edges e3 ON e3.src = so.id AND e3.type = 'DELIVERED_BY'
   JOIN nodes del ON del.id = e3.dst AND del.label = 'Delivery'
   JOIN edges e4 ON e4.src = del.id AND e4.type = 'BILLED_IN'
   JOIN nodes bill ON bill.id = e4.dst AND bill.label = 'BillingDocument'
   WHERE so.label = 'SalesOrder'
   GROUP BY prod.id, prod.props->>'description'
   ORDER BY billing_document_count DESC
   LIMIT 10

5. When given a raw number without context (could be billing doc, SO, delivery, etc.):
   First try: SELECT DISTINCT props->>'accountingDocument' AS journalEntryNumber FROM nodes WHERE label='JournalEntry' AND props->>'referenceDocument' = '{number}'
   Also try: SELECT * FROM nodes WHERE id LIKE '%{number}%'
`.trim();

  _cache = { nodeLabels, edgeTypes, summary };
  return _cache;
}

export function invalidateCache() {
  _cache = null;
}
