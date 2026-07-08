import Link from 'next/link';
import { ArrowUpRight, FileText, Layers, Loader2, Mic, RadioTower } from 'lucide-react';
import { publicEnv } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import {
  DEMO_WORKSPACE_ID,
  getDemoContentJobs,
  getDemoContentPackItems,
  getDemoContentSources,
  isDemoMode,
} from '@/lib/demo-mode';
import { listContentSources, listScheduledPackItems } from '@/lib/content-sources';
import { listActiveContentJobs } from '@/lib/content-jobs';
import type { ContentJobRow, ContentPackItemRow, ContentSourceRow } from '@/lib/supabase/types';
import { CHANNELS } from '@/lib/content-sources-schema';
import { cn } from '@/lib/utils';
import { SourceComposer } from './source-composer';

const SOURCE_STATUS_STYLE: Record<string, string> = {
  uploaded: 'text-ink-muted',
  extracting: 'text-[#0099ff]',
  extracted: 'text-[#0099ff]',
  repackaging: 'text-[#0099ff]',
  ready: 'text-[#22c55e]',
  failed: 'text-[#ff5577]',
};

function channelLabel(key: string): string {
  return CHANNELS.find((c) => c.key === key)?.label ?? key;
}

export default async function ContentOsPage() {
  const demoMode = isDemoMode();
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let workspaceId: string | null = demoMode ? DEMO_WORKSPACE_ID : null;
  let sources: ContentSourceRow[] = [];
  let activeJobs: ContentJobRow[] = [];
  let scheduled: ContentPackItemRow[] = [];
  let loadError: string | null = null;

  if (demoMode) {
    sources = getDemoContentSources();
    activeJobs = getDemoContentJobs();
    scheduled = getDemoContentPackItems().filter((i) => i.status === 'scheduled');
  } else if (supabaseConfigured) {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const ws = await getOrCreateCurrentWorkspace(user);
        workspaceId = ws.id;
        [sources, activeJobs, scheduled] = await Promise.all([
          listContentSources(ws.id),
          listActiveContentJobs(ws.id),
          listScheduledPackItems(ws.id),
        ]);
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Failed to load Content OS.';
    }
  }

  return (
    <div className="app-page text-ink">
      <div className="app-page-inner">
        <header className="content-os-hero">
          <div className="content-os-hero-copy">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-[#0099ff]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">
                Extract → repackage → distribute
              </span>
            </div>
            <h1>Drop a source. Build the pack. Approve distribution.</h1>
            <p>
              Paste raw material or upload source files, then turn them into approval-gated
              multi-channel media packs for every connected distribution lane.
            </p>
          </div>
          <div className="content-os-hero-meter">
            <RadioTower size={18} />
            <strong>{scheduled.length}</strong>
            <span>scheduled queue items</span>
          </div>
        </header>

        {loadError ? (
          <p className="mb-4 rounded-[10px] border border-[#ff5577]/40 bg-[#ff5577]/10 px-3 py-2 text-[12px] text-[#ff5577]">
            {loadError}
          </p>
        ) : null}

        <div className="content-os-grid grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            <SourceComposer workspaceId={workspaceId} demoMode={demoMode} />

            {/* Recent source library */}
            <section className="app-command-panel p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[14px] font-medium">Recent sources</h2>
                <span className="text-[11px] uppercase tracking-[0.14em] text-white/32">
                  {sources.length} total
                </span>
              </div>
              {sources.length === 0 ? (
                <p className="text-[13px] text-ink-muted">
                  No sources yet — add one above to start.
                </p>
              ) : (
                <ul className="divide-y divide-white/8">
                  {sources.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/content-os/${s.id}`}
                        className="group flex items-center gap-3 py-3 transition hover:opacity-90"
                      >
                        {s.type === 'audio' || s.type === 'video' ? (
                          <Mic size={15} className="text-ink-muted" />
                        ) : (
                          <FileText size={15} className="text-ink-muted" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-[13px]">{s.title}</span>
                        <span
                          className={cn(
                            'text-[11px] uppercase tracking-wider',
                            SOURCE_STATUS_STYLE[s.status] ?? 'text-ink-muted',
                          )}
                        >
                          {s.status}
                        </span>
                        <ArrowUpRight
                          size={14}
                          className="text-ink-muted transition group-hover:text-ink"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="space-y-5">
            {/* Active jobs */}
            <section className="app-command-panel p-5">
              <h2 className="mb-3 flex items-center gap-2 text-[14px] font-medium">
                Active jobs
                {activeJobs.length > 0 ? (
                  <Loader2 size={13} className="animate-spin text-[#0099ff]" />
                ) : null}
              </h2>
              {activeJobs.length === 0 ? (
                <p className="text-[12px] text-ink-muted">Nothing processing right now.</p>
              ) : (
                <ul className="space-y-2">
                  {activeJobs.map((j) => (
                    <li
                      key={j.id}
                      className="flex items-center justify-between border border-white/8 bg-black/28 px-3 py-2 text-[12px]"
                    >
                      <span className="capitalize text-ink">{j.kind}</span>
                      <span className="text-ink-muted">{j.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Scheduled distribution queue */}
            <section className="app-command-panel p-5">
              <h2 className="mb-3 text-[14px] font-medium">Scheduled queue</h2>
              {scheduled.length === 0 ? (
                <p className="text-[12px] text-ink-muted">No items scheduled yet.</p>
              ) : (
                <ul className="space-y-2">
                  {scheduled.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-center justify-between border border-white/8 bg-black/28 px-3 py-2 text-[12px]"
                    >
                      <span className="min-w-0 truncate text-ink">{channelLabel(it.channel)}</span>
                      <span className="text-[#22c55e]">{it.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
