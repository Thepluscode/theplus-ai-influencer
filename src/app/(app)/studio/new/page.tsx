import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { publicEnv, serverEnv } from '@/lib/env';
import { isLumaStubbed } from '@/lib/luma-stub';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { StudioWizard } from '../studio-wizard';

export default async function StudioNewPage() {
  const stubbed = isLumaStubbed();
  const lumaConfigured = stubbed || Boolean(serverEnv.LUMA_API_KEY);
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let saveDisabledReason: string | null = null;
  if (!supabaseConfigured) {
    saveDisabledReason = 'Set Supabase env vars in .env.local to enable Save.';
  } else {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        saveDisabledReason = 'Sign in to save your influencer.';
      } else {
        // Touch the workspace to make sure it exists. We don't need
        // the data here — the wizard's actions resolve it themselves.
        await getOrCreateCurrentWorkspace(user);
      }
    } catch (err) {
      saveDisabledReason =
        err instanceof Error
          ? `Supabase error: ${err.message}`
          : 'Supabase tables not ready — apply supabase/migrations/0001_initial_schema.sql.';
    }
  }

  return (
    <div className="min-h-full bg-[#070707] text-ink">
      <div className="px-5 py-5 lg:px-6 lg:py-6">
        <header className="mb-6 border-b border-[#1b1b1b] pb-5">
          <Link
            href="/studio"
            className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-muted transition hover:text-ink"
          >
            <ArrowLeft size={12} />
            Back to AI Studio
          </Link>
          <p className="framer-eyebrow">Create AI Influencer</p>
          <h1 className="mt-2 text-[28px] font-medium leading-[1.05] tracking-normal text-balance sm:text-[32px]">
            Cast a model.
            <br />
            Render in seconds.
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
            Define a persona — body, vibe, direction — and Luma renders a portrait and a full-body
            shot in parallel. Both share the same prompt subject so they read as the same person
            across framings.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {stubbed ? (
              <StatusPill tone="info">
                <span className="text-white">LUMA_STUB</span> on · placeholders
              </StatusPill>
            ) : !lumaConfigured ? (
              <StatusPill tone="warn">LUMA_API_KEY missing</StatusPill>
            ) : (
              <StatusPill tone="ok">Luma live</StatusPill>
            )}
          </div>
        </header>

        <StudioWizard saveDisabledReason={saveDisabledReason} />
      </div>
    </div>
  );
}

function StatusPill({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warn' | 'err' | 'ok';
  title?: string;
  children: React.ReactNode;
}) {
  const dot = {
    info: 'bg-[#0099ff]',
    warn: 'bg-[#ff7a3d]',
    err: 'bg-[#ff5577]',
    ok: 'bg-[#22c55e]',
  }[tone];
  return (
    <span
      title={title}
      className="inline-flex items-center gap-2 rounded-full bg-surface-1 px-3 py-1.5 text-[12px] text-ink"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
