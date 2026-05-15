import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { listAiModels } from '@/lib/ai-models';
import { publicEnv } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AiModelRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { StoryboardForm } from './storyboard-form';

export default async function NewStoryboardPage() {
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  let models: AiModelRow[] = [];
  if (supabaseConfigured) {
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
    <div className="min-h-full bg-[#070707] text-ink">
      <div className="px-5 py-5 lg:px-6 lg:py-6">
        <header className="mb-6 border-b border-[#1b1b1b] pb-5">
          <Link
            href="/storyboard"
            className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-muted transition hover:text-ink"
          >
            <ArrowLeft size={12} />
            Back to Storyboards
          </Link>
          <p className="framer-eyebrow">New storyboard</p>
          <h1 className="mt-2 text-[28px] font-medium leading-[1.05] tracking-normal text-balance sm:text-[32px]">
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
