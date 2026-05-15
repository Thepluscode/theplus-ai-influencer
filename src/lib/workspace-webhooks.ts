import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { WorkspaceWebhookRow } from '@/lib/supabase/types';
import type { WebhookEvent } from '@/lib/workspace-controls-schema';

interface DispatchInput {
  workspaceId: string;
  event: WebhookEvent;
  payload: Record<string, unknown>;
}

interface DispatchSummary {
  attempted: number;
  delivered: number;
  failed: number;
}

interface WebhookBody extends DispatchInput {
  id: string;
  occurredAt: string;
}

export function buildWorkspaceWebhookBody(input: DispatchInput, id: string): WebhookBody {
  return {
    id,
    workspaceId: input.workspaceId,
    event: input.event,
    payload: input.payload,
    occurredAt: new Date().toISOString(),
  };
}

export async function dispatchWorkspaceWebhookEvent(
  input: DispatchInput,
): Promise<DispatchSummary> {
  const supabase = await getWebhookClient();
  const { data, error } = await supabase
    .from('workspace_webhooks')
    .select('*')
    .eq('workspace_id', input.workspaceId)
    .eq('active', true)
    .contains('events', [input.event]);

  if (error) {
    console.error('Failed to load workspace webhooks for event dispatch', {
      workspaceId: input.workspaceId,
      event: input.event,
      error: error.message,
    });
    return { attempted: 0, delivered: 0, failed: 1 };
  }

  const webhooks = data ?? [];
  const results = await Promise.all(
    webhooks.map((webhook) => deliverWebhook(webhook, input, supabase)),
  );
  return {
    attempted: webhooks.length,
    delivered: results.filter(Boolean).length,
    failed: results.filter((ok) => !ok).length,
  };
}

async function getWebhookClient() {
  try {
    return getSupabaseAdminClient();
  } catch {
    return getSupabaseServerClient();
  }
}

async function deliverWebhook(
  webhook: WorkspaceWebhookRow,
  input: DispatchInput,
  supabase: Awaited<ReturnType<typeof getWebhookClient>>,
): Promise<boolean> {
  const deliveryId = crypto.randomUUID();
  const body = buildWorkspaceWebhookBody(input, deliveryId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  let status: number | null = null;
  let delivered = false;

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-theplus-event': input.event,
        'x-theplus-workspace-id': input.workspaceId,
        'x-theplus-delivery-id': deliveryId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    status = response.status;
    delivered = response.ok;
    if (!response.ok) {
      console.error('Workspace webhook delivery returned non-2xx', {
        webhookId: webhook.id,
        workspaceId: input.workspaceId,
        event: input.event,
        status: response.status,
      });
    }
  } catch (err) {
    console.error('Workspace webhook delivery failed', {
      webhookId: webhook.id,
      workspaceId: input.workspaceId,
      event: input.event,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeout);
  }

  const { error } = await supabase
    .from('workspace_webhooks')
    .update({
      last_delivery_at: new Date().toISOString(),
      last_delivery_status: status,
    })
    .eq('id', webhook.id)
    .eq('workspace_id', input.workspaceId);
  if (error) {
    console.error('Failed to record workspace webhook delivery status', {
      webhookId: webhook.id,
      workspaceId: input.workspaceId,
      event: input.event,
      error: error.message,
    });
  }

  return delivered;
}
