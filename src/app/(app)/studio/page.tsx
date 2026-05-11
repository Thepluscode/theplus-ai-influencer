import { listAiModels } from '@/lib/ai-models';
import { publicEnv, serverEnv } from '@/lib/env';
import { isLumaStubbed } from '@/lib/luma-stub';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AiModelRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { SavedModels } from './saved-models';
import { StudioWizard } from './studio-wizard';

export default async function StudioPage() {
  const stubbed = isLumaStubbed();
  const lumaConfigured = stubbed || Boolean(serverEnv.LUMA_API_KEY);
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let savedModels: AiModelRow[] = [];
  let saveDisabledReason: string | null = null;
  let modelsErrorReason: string | null = null;

  if (!supabaseConfigured) {
    saveDisabledReason = 'Set Supabase env vars in .env.local to enable Save.';
  } else {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        saveDisabledReason = 'Sign in to save your model.';
      } else {
        const ws = await getOrCreateCurrentWorkspace(user);
        savedModels = await listAiModels(ws.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Supabase error';
      modelsErrorReason = message;
      saveDisabledReason = 'Supabase tables not ready — apply supabase/migrations/0001_initial_schema.sql.';
    }
  }

  return (
    <div className="px-10 py-10">
      <header className="mb-8 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">Studio</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Define an AI influencer persona and Luma renders a portrait + full-body shot in
          parallel. The two outputs share the same prompt subject so they read as the same
          person from different framings.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {stubbed ? (
            <span className="rounded-md border border-sky-900/50 bg-sky-950/30 px-3 py-1.5 text-sky-300">
              LUMA_STUB on — placeholder images, no real generation. Unset to use Luma.
            </span>
          ) : !lumaConfigured ? (
            <span className="rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-1.5 text-amber-300">
              LUMA_API_KEY missing — generation will fail.
            </span>
          ) : null}
          {!supabaseConfigured ? (
            <span className="rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-1.5 text-amber-300">
              Supabase not configured — save / list disabled.
            </span>
          ) : null}
          {modelsErrorReason ? (
            <span className="rounded-md border border-red-900/50 bg-red-950/30 px-3 py-1.5 text-red-300">
              {modelsErrorReason}
            </span>
          ) : null}
        </div>
      </header>

      {supabaseConfigured && !modelsErrorReason ? <SavedModels models={savedModels} /> : null}

      <StudioWizard saveDisabledReason={saveDisabledReason} />
    </div>
  );
}
