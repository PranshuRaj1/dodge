import { NextResponse } from 'next/server';
import { getGraphData } from '@/lib/graphService';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const data = await getGraphData();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[/api/graph]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
