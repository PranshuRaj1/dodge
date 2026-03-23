import { NextRequest, NextResponse } from 'next/server';
import { ask } from '@/lib/queryEngine';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const question = typeof body.question === 'string' ? body.question.trim() : '';

    if (!question) {
      return NextResponse.json({ error: 'Missing question' }, { status: 400 });
    }

    const result = await ask(question);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[/api/query]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
