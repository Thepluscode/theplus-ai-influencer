import { NextResponse } from 'next/server';
import { createContentSourceFromInput } from '@/lib/content-source-create';
import type { CreateContentSourceInput } from '@/lib/content-sources-schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const result = await createContentSourceFromInput(body as CreateContentSourceInput);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
