import { type NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@/lib/env';
import { handleZernioWebhookEvent, verifyZernioSignature } from '@/lib/zernio-webhooks';

export const runtime = 'nodejs';

/**
 * Zernio inbound webhook endpoint. Register in the Zernio dashboard
 * (Webhooks → Settings) pointing at /api/webhooks/zernio with the secret
 * stored in ZERNIO_WEBHOOK_SECRET. Subscribed events:
 *   - comment.received  → drafts a reply into the comments inbox
 *   - message.received  → triages the DM into the inbox
 * Requires Zernio's Inbox add-on.
 *
 * Auth is by HMAC signature (X-Zernio-Signature), not a user session, so
 * the handler persists via the service-role admin client. We verify the
 * signature against the RAW body before parsing JSON.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = serverEnv.ZERNIO_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Zernio webhook not configured.' }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-zernio-signature');
  if (!verifyZernioSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  try {
    const result = await handleZernioWebhookEvent(payload);
    // Always 200 on a verified, well-formed event — including events we
    // chose not to handle — so Zernio doesn't retry deliveries we've
    // already acknowledged.
    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (err) {
    // Real processing failure (DB/LLM). 500 so Zernio retries with backoff.
    console.error('[zernio-webhook] handler failed', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'handler error' },
      { status: 500 },
    );
  }
}
