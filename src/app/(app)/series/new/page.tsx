import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { listAiModels } from '@/lib/ai-models';
import { getDemoModels, isDemoMode } from '@/lib/demo-mode';
import { publicEnv } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AiModelRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { SeriesPlanForm } from './series-plan-form';

export default async function NewSeriesPlanPage() {
  const demoMode = isDemoMode();
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let models: AiModelRow[] = [];
  let loadError: string | null = null;
  if (demoMode) {
    models = getDemoModels();
  } else if (supabaseConfigured) {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const ws = await getOrCreateCurrentWorkspace(user);
        models = await listAiModels(ws.id);
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Could not load roster';
    }
  }

  return (
    <div className="app-page workflow-page text-ink">
      <div className="app-page-inner">
        <header className="app-page-header workflow-hero">
          <Link
            href="/series"
            className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-muted transition hover:text-ink"
          >
            <ArrowLeft size={12} />
            Back to Content Engine
          </Link>
          <p className="framer-eyebrow">New Campaign</p>
          <h1 className="workflow-title mt-2">
            Brief the topics.
            <br />
            Generate the campaign.
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
            10 credits per campaign. The output includes social posts, face-led carousel briefs,
            filming scripts, LinkedIn posts, email copy, SEO/AEO blog drafts, and scheduled go-live
            times.
          </p>
          {loadError ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#ff5577]/40 bg-[#ff5577]/[0.07] px-3 py-1.5 text-[12px] text-[#ff5577]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff5577]" />
              {loadError}
            </p>
          ) : null}
        </header>

        <SeriesPlanForm models={models} />
      </div>
    </div>
  );
}
