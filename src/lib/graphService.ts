import getDb from '@/lib/db';

const MAX_NODES_PER_LABEL = 15; // 8 labels × 15 = ~120 nodes

export async function getGraphData() {
  const db = getDb();

  // Sample nodes across all labels
  const labels = db.prepare(`SELECT DISTINCT label FROM nodes`).all() as { label: string }[];

  const nodeMap = new Map<string, { id: string; label: string; props: unknown }>();

  for (const { label } of labels) {
    const batch = db.prepare(
      `SELECT id, label, props FROM nodes WHERE label = ? LIMIT ?`
    ).all(label, MAX_NODES_PER_LABEL) as { id: string; label: string; props: string }[];

    for (const n of batch) {
      nodeMap.set(n.id, { id: n.id, label: n.label, props: JSON.parse(n.props) });
    }
  }

  const sampledIds = [...nodeMap.keys()];
  let edges: any[] = [];
  let rawEdges: any[] = [];

  if (sampledIds.length > 0) {
    // Get all edges where source is in the sampled set
    const placeholders = sampledIds.map(() => '?').join(',');
    rawEdges = db.prepare(
      `SELECT id, src, dst, type, props FROM edges WHERE src IN (${placeholders}) LIMIT 500`
    ).all(...sampledIds) as { id: string; src: string; dst: string; type: string; props: string }[];

    // For any edge whose dst is not in nodeMap yet, load that node too
    const missingIds = [...new Set(rawEdges.map(e => e.dst).filter(id => !nodeMap.has(id)))];
    if (missingIds.length > 0) {
      const mp2 = missingIds.map(() => '?').join(',');
      const missing = db.prepare(
        `SELECT id, label, props FROM nodes WHERE id IN (${mp2})`
      ).all(...missingIds) as { id: string; label: string; props: string }[];
      for (const n of missing) {
        nodeMap.set(n.id, { id: n.id, label: n.label, props: JSON.parse(n.props) });
      }
    }

    edges = rawEdges.map(e => ({
      id: e.id,
      src: e.src,
      dst: e.dst,
      type: e.type,
      props: JSON.parse(e.props ?? '{}'),
    }));
  }

  const nodes = [...nodeMap.values()];

  return { nodes, edges };
}
