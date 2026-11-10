import { listAiModels } from '@/lib/ai-models';
import { COSTS } from '@/lib/credits';
import { listCreations, toCreationView } from '@/lib/creations';
import { getDemoModels, isDemoMode } from '@/lib/demo-mode';
import { publicEnv, serverEnv } from '@/lib/env';
import { personaHandle } from '@/lib/handles';
import { isLumaStubbed } from '@/lib/luma-stub';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AiModelRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import type { CreationView } from '@/types/creation';
import { CreateStudio, type PersonaOption } from './create-studio';

// Per-user results and credit-gated actions: never prerender, even when the
// build runs without Supabase env (which would otherwise freeze an empty page).
export const dynamic = 'force-dynamic';

export default async function CreatePage() {
  const demoMode = isDemoMode();
  const lumaConfigured = isLumaStubbed() || Boolean(serverEnv.LUMA_API_KEY);
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let personas: AiModelRow[] = [];
  let creations: CreationView[] = [];
  let loadError: string | null = null;

  if (demoMode) {
    personas = getDemoModels();
  } else if (!supabaseConfigured) {
    loadError = 'Set Supabase env vars in .env.local to use Create.';
  } else {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const ws = await getOrCreateCurrentWorkspace(user);
        personas = await listAiModels(ws.id);
        creations = (await listCreations(ws.id)).map((row) => toCreationView(row, personas));
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Could not load your workspace.';
    }
  }

  const options: PersonaOption[] = personas.map((p) => ({
    id: p.id,
    name: p.name,
    handle: personaHandle(p.name),
    portraitUrl: p.portrait_url,
  }));

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8">
      <header className="mb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Production
        </p>
        <h1 className="mt-1 text-[32px] font-medium tracking-[-0.02em] text-ink">Generate</h1>
        <p className="mt-1 text-[14px] text-ink-muted">
          Describe a picture. Mention a persona as @handle to lock their face.
        </p>
      </header>
      <CreateStudio
        personas={options}
        initialCreations={creations}
        costs={{ picture: COSTS.CREATE_PICTURE, edit: COSTS.CREATE_EDIT }}
        demoMode={demoMode}
        disabledReason={
          loadError ?? (lumaConfigured ? null : 'Set LUMA_API_KEY (or LUMA_STUB=1) to render.')
        }
      />
    </div>
  );
}
