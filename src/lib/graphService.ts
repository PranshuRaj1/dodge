import getDb from '@/lib/db';

const MAX_NODES_PER_LABEL = 15; // 8 labels × 15 = ~120 nodes

export async function getGraphData() {
  const db = getDb();

  // Sample nodes across all labels
  const labels = await db`SELECT DISTINCT label FROM nodes`;

  const nodeMap = new Map<string, { id: string; label: string; props: unknown }>();

  for (const { label } of labels) {
    const batch = await db`
      SELECT id, label, props FROM nodes WHERE label = ${label} LIMIT ${MAX_NODES_PER_LABEL}
    `;

    for (const n of batch) {
      nodeMap.set(n.id, { id: n.id, label: n.label, props: typeof n.props === 'string' ? JSON.parse(n.props) : n.props });
    }
  }

  const sampledIds = [...nodeMap.keys()];
  let edges: any[] = [];
  let rawEdges: any[] = [];

  if (sampledIds.length > 0) {
    // Get all edges where source is in the sampled set
    rawEdges = await db`
      SELECT id, src, dst, type, props FROM edges WHERE src = ANY(${sampledIds}) LIMIT 500
    `;

    // For any edge whose dst is not in nodeMap yet, load that node too
    const missingIds = [...new Set(rawEdges.map((e: any) => e.dst).filter((id: string) => !nodeMap.has(id)))];
    if (missingIds.length > 0) {
      const missing = await db`
        SELECT id, label, props FROM nodes WHERE id = ANY(${missingIds})
      `;
      for (const n of missing) {
        nodeMap.set(n.id, { id: n.id, label: n.label, props: typeof n.props === 'string' ? JSON.parse(n.props) : n.props });
      }
    }

    edges = rawEdges.map((e: any) => ({
      id: e.id,
      src: e.src,
      dst: e.dst,
      type: e.type,
      props: typeof e.props === 'string' ? JSON.parse(e.props) : (e.props ?? {}),
    }));
  }

  const nodes = [...nodeMap.values()];

  return { nodes, edges };
}
