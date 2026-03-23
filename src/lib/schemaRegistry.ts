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
    `SELECT label, COUNT(*) as count FROM nodes GROUP BY label ORDER BY count DESC`
  ).all() as { label: string; count: number }[];

  const edgeTypes = db.prepare(
    `SELECT type, COUNT(*) as count FROM edges GROUP BY type ORDER BY count DESC`
  ).all() as { type: string; count: number }[];

  const totalNodes = nodeLabels.reduce((s, r) => s + r.count, 0);
  const totalEdges = edgeTypes.reduce((s, r) => s + r.count, 0);

  const nodeLines = nodeLabels
    .map(r => `  - ${r.label} (${r.count} records)`)
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
- Common node ID prefixes (in the \`id\` column): SO- (SalesOrder), SOI- (SalesOrderItem), DEL- (Delivery), BILL- (BillingDocument), CUST- (Customer), PROD- (Product), JE- (JournalEntry), PAY- (Payment)
- HUGE IMPORTANT RULE: Users will often ask about raw SAP numbers like '740508' or '91150187' without the prefix. Do NOT assume the prefix. Instead, search the \`id\` column using LIKE '%740508%' OR search the JSON properties using json_extract(props, '$.salesOrder') = '740508', json_extract(props, '$.billingDocument') = '91150187', etc.
- Example edge traversal: SELECT n2.* FROM nodes n1 JOIN edges e ON n1.id = e.src JOIN nodes n2 ON e.dst = n2.id WHERE n1.label='SalesOrder' AND e.type='ORDERED_BY'
- To find customer orders: join nodes on edges where type = 'ORDERED_BY'
`.trim();

  _cache = { nodeLabels, edgeTypes, summary };
  return _cache;
}

export function invalidateCache() {
  _cache = null;
}
