import { NextRequest, NextResponse } from 'next/server';
import getDb from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const nodeId = typeof body.nodeId === 'string' ? body.nodeId.trim() : '';

    if (!nodeId) {
      return NextResponse.json({ error: 'Missing nodeId' }, { status: 400 });
    }

    const db = getDb();

    // Get all edges where this node is src or dst
    const edges = db.prepare(
      `SELECT id, src, dst, type, props FROM edges WHERE src = ? OR dst = ?`
    ).all(nodeId, nodeId) as { id: string; src: string; dst: string; type: string; props: string }[];

    // Collect all connected node IDs
    const connectedIds = new Set<string>();
    for (const e of edges) {
      connectedIds.add(e.src);
      connectedIds.add(e.dst);
    }
    connectedIds.delete(nodeId); // exclude self (caller already has it)

    // Fetch connected nodes
    const nodes: { id: string; label: string; props: unknown }[] = [];
    for (const id of connectedIds) {
      const n = db.prepare(`SELECT id, label, props FROM nodes WHERE id = ?`).get(id) as
        | { id: string; label: string; props: string }
        | undefined;
      if (n) nodes.push({ id: n.id, label: n.label, props: JSON.parse(n.props) });
    }

    return NextResponse.json({
      nodes,
      edges: edges.map(e => ({
        id: e.id,
        src: e.src,
        dst: e.dst,
        type: e.type,
        props: JSON.parse(e.props),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[/api/graph/expand]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
