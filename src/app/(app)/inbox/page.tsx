import { Inbox as InboxIcon } from 'lucide-react';
import { listAiModels } from '@/lib/ai-models';
import { getDemoDmThreads, getDemoModels, isDemoMode } from '@/lib/demo-mode';
import { listDmThreads } from '@/lib/dm-engine';
import { publicEnv } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AiModelRow, DmThreadRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { InboxBoard } from './inbox-board';
import { cn } from '@/lib/utils';

export default async function InboxPage() {
  const demoMode = isDemoMode();
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let dms: DmThreadRow[] = [];
  let models: AiModelRow[] = [];
  let loadError: string | null = null;
  if (demoMode) {
    dms = getDemoDmThreads();
    models = getDemoModels();
  } else if (supabaseConfigured) {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const ws = await getOrCreateCurrentWorkspace(user);
        [dms, models] = await Promise.all([listDmThreads(ws.id), listAiModels(ws.id)]);
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Unknown error';
    }
  }

  const byClass = dms.reduce<Record<string, number>>((acc, d) => {
    acc[d.classification] = (acc[d.classification] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="app-page text-ink">
      <div className="app-page-inner">
        <header className="app-page-header">
          <p className="framer-eyebrow">Inbox</p>
          <h1 className="mt-2 text-[28px] font-medium leading-[1.05] tracking-normal text-balance sm:text-[32px]">
            DMs, triaged.
            <br />
            Without the second job.
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
            Paste an inbound DM and the LLM buckets it (collab / lead / fan / support / spam) and
            drafts a reply. Approve, edit, or archive — paste the reply on the platform. Native DM
            ingest is a v2 wiring.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {demoMode ? <StatusPill tone="info">Demo workspace · sample inbox</StatusPill> : null}
            {!demoMode && !supabaseConfigured ? (
              <StatusPill tone="warn">Supabase off · paste flow unavailable</StatusPill>
            ) : null}
            <ClsPill cls="collab" count={byClass.collab ?? 0} />
            <ClsPill cls="lead" count={byClass.lead ?? 0} />
            <ClsPill cls="support" count={byClass.support ?? 0} />
            <ClsPill cls="fan" count={byClass.fan ?? 0} />
            <ClsPill cls="spam" count={byClass.spam ?? 0} />
            {loadError ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-[#ff5577]/40 bg-[#ff5577]/[0.07] px-3 py-1.5 text-[12px] text-[#ff5577]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ff5577]" />
                {loadError}
              </span>
            ) : null}
          </div>
        </header>

        <InboxBoard dms={dms} models={models} />
      </div>
    </div>
  );
}

function StatusPill({ tone, children }: { tone: 'info' | 'warn'; children: React.ReactNode }) {
  const dot = {
    info: 'bg-[#0099ff]',
    warn: 'bg-[#ff7a3d]',
  }[tone];
  return (
    <span className="inline-flex h-7 items-center gap-2 rounded-full bg-surface-1 px-3 text-[12px] text-ink ring-1 ring-[#262626]">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

function ClsPill({ cls, count }: { cls: DmThreadRow['classification']; count: number }) {
  const tone: Record<DmThreadRow['classification'], string> = {
    collab: 'bg-[#a855f7]/10 text-[#a855f7] ring-[#a855f7]/30',
    lead: 'bg-[#22c55e]/10 text-[#22c55e] ring-[#22c55e]/30',
    support: 'bg-[#ff7a3d]/10 text-[#ff7a3d] ring-[#ff7a3d]/30',
    fan: 'bg-[#0099ff]/10 text-[#0099ff] ring-[#0099ff]/30',
    spam: 'bg-[#ff5577]/10 text-[#ff5577] ring-[#ff5577]/30',
    other: 'bg-surface-2 text-ink-muted ring-[#262626]',
  };
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium uppercase tracking-wider ring-1',
        tone[cls],
      )}
    >
      <InboxIcon size={11} />
      {cls} · <span className="tabular-nums">{count}</span>
    </span>
  );
}
