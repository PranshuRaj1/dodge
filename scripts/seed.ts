/**
 * scripts/seed.ts
 * Idempotent ingestion of all SAP O2C JSONL data into SQLite graph DB.
 * Run with: npm run seed
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// ── Paths ────────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'sap-o2c-data');
const DB_PATH = path.join(ROOT, 'data', 'o2c.db');
const SCHEMA_PATH = path.join(ROOT, 'data', 'schema.sql');

// ── Setup ────────────────────────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(SCHEMA_PATH, 'utf-8'));

const insertNode = db.prepare(
  `INSERT OR IGNORE INTO nodes (id, label, props) VALUES (?, ?, ?)`
);
const insertEdge = db.prepare(
  `INSERT OR IGNORE INTO edges (id, src, dst, type, props) VALUES (?, ?, ?, ?, ?)`
);

let nodeCount = 0;
let edgeCount = 0;

// ── Helpers ──────────────────────────────────────────────────────────────────
function readJsonl(dir: string): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  if (!fs.existsSync(dir)) return rows;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'))) {
    const lines = fs.readFileSync(path.join(dir, file), 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) rows.push(JSON.parse(trimmed));
    }
  }
  return rows;
}

function node(id: string, label: string, props: Record<string, unknown>) {
  insertNode.run(id, label, JSON.stringify(props));
  nodeCount++;
}

function edge(src: string, dst: string, type: string, props: Record<string, unknown> = {}) {
  const id = `${type}::${src}::${dst}`;
  insertEdge.run(id, src, dst, type, JSON.stringify(props));
  edgeCount++;
}

// ── Ingestion (wrapped in a single transaction for speed) ────────────────────
const runSeed = db.transaction(() => {

  // ── 1. Products ─────────────────────────────────────────────────────────────
  const productDescMap: Record<string, string> = {};
  for (const r of readJsonl(path.join(DATA_DIR, 'product_descriptions'))) {
    const pid = String(r.product ?? '');
    if (r.language === 'EN' || !productDescMap[pid]) {
      productDescMap[pid] = String(r.productDescription ?? '');
    }
  }

  for (const r of readJsonl(path.join(DATA_DIR, 'products'))) {
    const id = `PROD-${r.product}`;
    node(id, 'Product', { ...r, description: productDescMap[String(r.product)] ?? '' });
  }

  // ── 2. Business Partners / Customers ────────────────────────────────────────
  const bpAddrMap: Record<string, Record<string, unknown>> = {};
  for (const r of readJsonl(path.join(DATA_DIR, 'business_partner_addresses'))) {
    bpAddrMap[String(r.businessPartner)] = r;
  }

  for (const r of readJsonl(path.join(DATA_DIR, 'business_partners'))) {
    const id = `CUST-${r.businessPartner}`;
    const addr = bpAddrMap[String(r.businessPartner)] ?? {};
    node(id, 'Customer', { ...r, ...addr });
  }

  // ── 3. Sales Orders (Headers) ────────────────────────────────────────────────
  for (const r of readJsonl(path.join(DATA_DIR, 'sales_order_headers'))) {
    const id = `SO-${r.salesOrder}`;
    node(id, 'SalesOrder', r);

    // ORDERED_BY edge → Customer
    if (r.soldToParty) {
      edge(id, `CUST-${r.soldToParty}`, 'ORDERED_BY');
    }
  }

  // ── 4. Sales Order Items ────────────────────────────────────────────────────
  for (const r of readJsonl(path.join(DATA_DIR, 'sales_order_items'))) {
    const itemId = `SOI-${r.salesOrder}-${r.salesOrderItem}`;
    node(itemId, 'SalesOrderItem', r);

    // HAS_ITEM edge: SO → item
    edge(`SO-${r.salesOrder}`, itemId, 'HAS_ITEM');

    // CONTAINS edge: item → product
    if (r.material) {
      edge(itemId, `PROD-${r.material}`, 'CONTAINS');
    }
  }

  // ── 5. Deliveries (Headers) ──────────────────────────────────────────────────
  for (const r of readJsonl(path.join(DATA_DIR, 'outbound_delivery_headers'))) {
    const id = `DEL-${r.deliveryDocument}`;
    node(id, 'Delivery', r);

    // SHIPPED_TO edge: Delivery → Customer (if shipToParty present)
    if (r.shipToParty) {
      edge(id, `CUST-${r.shipToParty}`, 'SHIPPED_TO');
    }
  }

  // ── 6. Delivery Items → link Delivery to SalesOrder ──────────────────────────
  // referenceSdDocument on delivery items = sales order number
  const soDeliveryMap = new Set<string>();
  for (const r of readJsonl(path.join(DATA_DIR, 'outbound_delivery_items'))) {
    const delId = `DEL-${r.deliveryDocument}`;
    const soId  = `SO-${r.referenceSdDocument}`;
    const key   = `${soId}::${delId}`;
    if (!soDeliveryMap.has(key)) {
      edge(soId, delId, 'DELIVERED_BY');
      soDeliveryMap.add(key);
    }
  }

  // ── 7. Billing Documents (Headers) ──────────────────────────────────────────
  for (const r of readJsonl(path.join(DATA_DIR, 'billing_document_headers'))) {
    const id = `BILL-${r.billingDocument}`;
    node(id, 'BillingDocument', r);
  }

  // ── 8. Billing Document Items → link Billing to Delivery ────────────────────
  // referenceSdDocument on billing items = delivery document number
  const delBillMap = new Set<string>();
  for (const r of readJsonl(path.join(DATA_DIR, 'billing_document_items'))) {
    const billId = `BILL-${r.billingDocument}`;
    const delId  = `DEL-${r.referenceSdDocument}`;
    const key    = `${delId}::${billId}`;
    if (!delBillMap.has(key)) {
      edge(delId, billId, 'BILLED_IN');
      delBillMap.add(key);
    }
  }

  // ── 9. Journal Entry Items ───────────────────────────────────────────────────
  for (const r of readJsonl(path.join(DATA_DIR, 'journal_entry_items_accounts_receivable'))) {
    const id = `JE-${r.accountingDocument}-${r.accountingDocumentItem ?? '000'}`;
    node(id, 'JournalEntry', r);

    // Link to billing document if present
    if (r.billingDocument) {
      edge(`BILL-${r.billingDocument}`, id, 'POSTS_TO');
    }
  }

  // ── 10. Payments ─────────────────────────────────────────────────────────────
  for (const r of readJsonl(path.join(DATA_DIR, 'payments_accounts_receivable'))) {
    // Use accountingDocument as primary key, fall back to composite
    const pkField = r.accountingDocument ?? r.paymentDocument ?? r.clearingDocument;
    const seqField = r.accountingDocumentItem ?? r.lineItem ?? '000';
    const id = `PAY-${pkField}-${seqField}`;
    node(id, 'Payment', r);

    // Link to journal entry / billing doc if we can find a reference
    if (r.billingDocument) {
      edge(`BILL-${r.billingDocument}`, id, 'SETTLED_BY');
    }
    if (r.clearingDocument && r.clearingDocumentItem) {
      const jeId = `JE-${r.clearingDocument}-${r.clearingDocumentItem}`;
      edge(jeId, id, 'CLEARED_BY');
    }
  }

  // ── 11. Schedule Lines (attach to SO Item) ───────────────────────────────────
  // These carry confirmed qty / delivery dates — attach as metadata only (no new nodes)
  // skip for graph clarity

  // ── 12. Billing Cancellations ────────────────────────────────────────────────
  for (const r of readJsonl(path.join(DATA_DIR, 'billing_document_cancellations'))) {
    if (r.cancelledBillingDocument && r.billingDocument) {
      edge(`BILL-${r.cancelledBillingDocument}`, `BILL-${r.billingDocument}`, 'CANCELLED_BY');
    }
  }
});

runSeed();

console.log(`✅  Seeded ${nodeCount} nodes and ${edgeCount} edges into ${DB_PATH}`);
