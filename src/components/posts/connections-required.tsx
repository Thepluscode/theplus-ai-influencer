import { AlertTriangle } from 'lucide-react';
import type { Platform } from '@/types/post';

/**
 * Surfaces "you picked X but it's not connected via Zernio" warnings in
 * any place we're about to publish a post. Pure render — caller decides
 * whether to *block* the action when this returns non-empty content.
 *
 * Used by:
 *   - Schedule panel on /create-post
 *   - Post Details modal (Phase 4)
 *
 * Returns null when every selected platform is connected.
 */
export function ConnectionsRequired({
  selected,
  connected,
}: {
  selected: Platform[];
  connected: Platform[];
}) {
  const missing = selected.filter((p) => !connected.includes(p));
  if (missing.length === 0) return null;

  return (
    <div className="rounded-[12px] border border-[#ff7a3d]/40 bg-[#ff7a3d]/[0.07] p-3" role="alert">
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#ff7a3d]" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-[#ff7a3d]">Connections required</p>
          <p className="mt-1 text-[12px] leading-[1.4] text-ink-muted">
            {missing.map((p) => p[0].toUpperCase() + p.slice(1)).join(', ')} not connected. Connect
            via{' '}
            <a
              href="/accounts"
              className="font-medium text-[#0099ff] underline-offset-2 hover:underline"
            >
              Accounts
            </a>{' '}
            or remove those platforms.
          </p>
        </div>
      </div>
    </div>
  );
}
