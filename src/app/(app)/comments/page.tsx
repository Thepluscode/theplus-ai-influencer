import { Inbox, MessageSquare } from 'lucide-react';
import { listComments } from '@/lib/comments-engine';
import { getDemoComments, getDemoModels, isDemoMode } from '@/lib/demo-mode';
import { publicEnv } from '@/lib/env';
import { listAiModels } from '@/lib/ai-models';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AiModelRow, CommentRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { CommentsBoard } from './comments-board';

export default async function CommentsPage() {
  const demoMode = isDemoMode();
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let comments: CommentRow[] = [];
  let models: AiModelRow[] = [];
  let loadError: string | null = null;
  if (demoMode) {
    comments = getDemoComments();
    models = getDemoModels();
  } else if (supabaseConfigured) {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const ws = await getOrCreateCurrentWorkspace(user);
        [comments, models] = await Promise.all([listComments(ws.id), listAiModels(ws.id)]);
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Unknown error';
    }
  }

  const pending = comments.filter((c) => c.status === 'pending').length;
  const handled = comments.length - pending;

  return (
    <div className="app-page text-ink">
      <div className="app-page-inner">
        <header className="app-page-header">
          <p className="framer-eyebrow">Comments</p>
          <h1 className="mt-2 text-[28px] font-medium leading-[1.05] tracking-normal text-balance sm:text-[32px]">
            Triage at the speed
            <br />
            of community.
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
            Paste an incoming comment, the LLM classifies it (fan / question / troll / spam /
            collab) and drafts a reply in the persona&apos;s voice. Approve, edit, or hide — then
            paste the reply on the platform. Direct ingest is a v2 wiring.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {demoMode ? <Pill tone="info">Demo workspace · sample queue</Pill> : null}
            {!demoMode && !supabaseConfigured ? (
              <Pill tone="warn">Supabase off · paste flow unavailable</Pill>
            ) : null}
            <Pill tone="info">
              <Inbox size={11} /> {pending} pending
            </Pill>
            <Pill tone="ok">
              <MessageSquare size={11} /> {handled} handled
            </Pill>
            {loadError ? <Pill tone="err">{loadError}</Pill> : null}
          </div>
        </header>

        <CommentsBoard comments={comments} models={models} />
      </div>
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: 'info' | 'ok' | 'warn' | 'err';
  children: React.ReactNode;
}) {
  const dot = {
    info: 'bg-[#0099ff]',
    ok: 'bg-[#22c55e]',
    warn: 'bg-[#ff7a3d]',
    err: 'bg-[#ff5577]',
  }[tone];
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-surface-1 px-3 py-1.5 text-[12px] text-ink ring-1 ring-[#262626]">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
