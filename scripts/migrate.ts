import Database from 'better-sqlite3';
import { neon } from '@neondatabase/serverless';
import path from 'path';
import fs from 'fs';

// We explicitly install better-sqlite3 locally for this script since it was removed from package.json
const sqlite = new Database(path.join(process.cwd(), 'data', 'o2c.db'));
const pg = neon(process.env.DATABASE_URL!);

async function run() {
  console.log('Applying schema to NeonDB...');
  await pg`CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, label TEXT NOT NULL, props JSONB NOT NULL DEFAULT '{}')`;
  await pg`CREATE TABLE IF NOT EXISTS edges (id TEXT PRIMARY KEY, src TEXT NOT NULL, dst TEXT NOT NULL, type TEXT NOT NULL, props JSONB NOT NULL DEFAULT '{}')`;
  await pg`CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(src)`;
  await pg`CREATE INDEX IF NOT EXISTS idx_edges_dst ON edges(dst)`;
  await pg`CREATE INDEX IF NOT EXISTS idx_nodes_label ON nodes(label)`;
  await pg`CREATE INDEX IF NOT EXISTS idx_nodes_props ON nodes USING GIN(props)`;
  await pg`CREATE INDEX IF NOT EXISTS idx_edges_props ON edges USING GIN(props)`;
  console.log('Schema applied successfully.');

  console.log('Reading nodes from SQLite...');
  const nodes = sqlite.prepare('SELECT * FROM nodes').all() as any[];
  console.log(`Found ${nodes.length} nodes to migrate.`);
  
  for (const node of nodes) {
    await pg`INSERT INTO nodes (id, label, props) VALUES (${node.id}, ${node.label}, ${node.props}::jsonb) ON CONFLICT DO NOTHING`;
  }
  
  console.log('Reading edges from SQLite...');
  const edges = sqlite.prepare('SELECT * FROM edges').all() as any[];
  console.log(`Found ${edges.length} edges to migrate.`);
  
  for (const edge of edges) {
    await pg`INSERT INTO edges (id, src, dst, type, props) VALUES (${edge.id}, ${edge.src}, ${edge.dst}, ${edge.type}, ${edge.props}::jsonb) ON CONFLICT DO NOTHING`;
  }
  
  console.log(`Successfully migrated ${nodes.length} nodes, ${edges.length} edges!`);
}

run().catch(console.error);
