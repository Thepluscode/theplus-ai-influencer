import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { listAiModels } from '@/lib/ai-models';
import { getDemoModels, isDemoMode } from '@/lib/demo-mode';
import { publicEnv } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AiModelRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { StoryboardForm } from './storyboard-form';

export default async function NewStoryboardPage() {
  const demoMode = isDemoMode();
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  let models: AiModelRow[] = [];
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
    } catch {
      // best-effort
    }
  }

  return (
    <div className="app-page workflow-page text-ink">
      <div className="app-page-inner">
        <header className="app-page-header workflow-hero">
          <Link
            href="/storyboard"
            className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-muted transition hover:text-ink"
          >
            <ArrowLeft size={12} />
            Back to Storyboards
          </Link>
          <p className="framer-eyebrow">New storyboard</p>
          <h1 className="workflow-title mt-2">
            Brief the reel.
            <br />
            Render every shot.
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
            The storyboarder writes the script + renders each shot with the persona&apos;s face
            locked. ~95 credits for a 4-shot reel (15 for the script + 20 per shot).
          </p>
        </header>

        <StoryboardForm models={models} />
      </div>
    </div>
  );
}
