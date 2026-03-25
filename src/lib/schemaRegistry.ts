/**
 * src/lib/schemaRegistry.ts
 * Introspects SQLite and returns a compact schema string for the LLM.
 */

import getDb from './db';

export interface SchemaContext {
  nodeLabels: { label: string; count: number }[];
  edgeTypes:  { type: string; count: number }[];
  summary: string;
}

let _cache: SchemaContext | null = null;

export function getSchemaContext(): SchemaContext {
  if (_cache) return _cache;

  const db = getDb();

  const nodeLabels = db.prepare(
    `SELECT label, COUNT(*) as count, MAX(props) as sampleProps FROM nodes GROUP BY label ORDER BY count DESC`
  ).all() as { label: string; count: number; sampleProps: string }[];

  const edgeTypes = db.prepare(
    `SELECT type, COUNT(*) as count FROM edges GROUP BY type ORDER BY count DESC`
  ).all() as { type: string; count: number }[];

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
SQLite graph database with ${totalNodes} nodes and ${totalEdges} edges.

DATABASE SCHEMA:
Table: nodes
  Columns: id (TEXT PK), label (TEXT), props (TEXT JSON)

Table: edges
  Columns: id (TEXT PK), src (TEXT), dst (TEXT), type (TEXT), props (TEXT JSON)

NODE LABELS (node type is stored in the \`label\` column):
${nodeLines}

EDGE TYPES (relationship type is stored in the \`type\` column):
${edgeLines}

IMPORTANT QUERY NOTES:
- To filter nodes by type, use: WHERE label = 'SalesOrder'
- Node properties are in the \`props\` JSON column. Use json_extract(props, '$.fieldName') to access fields.
- IMPORTANT: If you do not know the exact JSON property key, DO NOT guess it. Instead, SELECT the entire \`props\` column (e.g., \`SELECT props FROM nodes WHERE...\`) so you can read all available fields in the result.
- Common node ID prefixes (in the \`id\` column): SO- (SalesOrder), SOI- (SalesOrderItem), DEL- (Delivery), BILL- (BillingDocument), CUST- (Customer), PROD- (Product), JE- (JournalEntry), PAY- (Payment)
- HUGE IMPORTANT RULE: Users will often ask about raw SAP numbers like '740508' or '91150187' without the prefix. Do NOT assume the prefix. Instead, search the \`id\` column using LIKE '%740508%' OR search the JSON properties using json_extract(props, '$.salesOrder') = '740508', json_extract(props, '$.billingDocument') = '91150187', etc.
- Example edge traversal: SELECT n2.* FROM nodes n1 JOIN edges e ON n1.id = e.src JOIN nodes n2 ON e.dst = n2.id WHERE n1.label='SalesOrder' AND e.type='ORDERED_BY'
- To find customer orders: join nodes on edges where type = 'ORDERED_BY'
- NEVER reverse edge directions. src and dst are fixed. Always join ON e.dst = node.id when the node is the destination, and ON e.src = node.id when the node is the source.

KEY RELATIONSHIP PATTERNS:
1. Finding journal entry number linked to a billing document number (e.g. '90504273'):
   JournalEntry nodes have a 'referenceDocument' prop that stores the billing document number.
   The journal entry number itself is stored in the 'accountingDocument' prop of JournalEntry nodes.
   CORRECT QUERY:
   SELECT DISTINCT json_extract(props, '$.accountingDocument') AS journalEntryNumber
   FROM nodes
   WHERE label = 'JournalEntry'
     AND json_extract(props, '$.referenceDocument') = '90504273';
   
   This is the PREFERRED way to find the accounting document / journal entry linked to any billing doc.
   Do NOT use edge traversal with POSTS_TO — use this direct prop lookup instead.

2. EDGE DIRECTIONS (CRITICAL — always use exactly these directions, never reverse them):
   - SalesOrder   → ORDERED_BY   → Customer        (SO is src,  CUST is dst)
   - SalesOrder   → DELIVERED_BY → Delivery         (SO is src,  DEL is dst)
   - SalesOrder   → HAS_ITEM     → SalesOrderItem   (SO is src,  SOI is dst)
     NOTE: to traverse from SOI back to SO, reverse: JOIN edges ON e.dst = soi.id AND e.type = 'HAS_ITEM', then SO = e.src
   - SalesOrderItem → CONTAINS   → Product          (SOI is src, PROD is dst)
   - Delivery     → BILLED_IN    → BillingDocument  (DEL is src, BILL is dst)

3. Full O2C chain traversal (Sales Order → Delivery → Billing → Journal Entry):
   SO → DELIVERED_BY → DEL → BILLED_IN → BILL
   JournalEntry nodes link to billing docs via: json_extract(props,'$.referenceDocument') = billingDocNumber

4. Products associated with billing documents (CRITICAL — use this exact pattern):
   SELECT prod.id, json_extract(prod.props, '$.name') AS product_name, COUNT(DISTINCT bill.id) AS billing_document_count
   FROM nodes prod
   JOIN edges e1 ON e1.dst = prod.id AND e1.type = 'CONTAINS'
   JOIN nodes soi ON soi.id = e1.src AND soi.label = 'SalesOrderItem'
   JOIN edges e2 ON e2.dst = soi.id AND e2.type = 'HAS_ITEM'
   JOIN nodes so ON so.id = e2.src AND so.label = 'SalesOrder'
   JOIN edges e3 ON e3.src = so.id AND e3.type = 'DELIVERED_BY'
   JOIN nodes del ON del.id = e3.dst AND del.label = 'Delivery'
   JOIN edges e4 ON e4.src = del.id AND e4.type = 'BILLED_IN'
   JOIN nodes bill ON bill.id = e4.dst AND bill.label = 'BillingDocument'
   GROUP BY prod.id
   ORDER BY billing_document_count DESC
   LIMIT 10

5. When given a raw number without context (could be billing doc, SO, delivery, etc.):
   First try: SELECT DISTINCT json_extract(props, '$.accountingDocument') AS journalEntryNumber FROM nodes WHERE label='JournalEntry' AND json_extract(props,'$.referenceDocument') = '{number}'
   Also try: SELECT * FROM nodes WHERE id LIKE '%{number}%'
`.trim();

  _cache = { nodeLabels, edgeTypes, summary };
  return _cache;
}

export function invalidateCache() {
  _cache = null;
}
