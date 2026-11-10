import 'server-only';
import { listAiModels } from '@/lib/ai-models';
import { listCreations, toCreationView } from '@/lib/creations';
import { getDemoModels, isDemoMode } from '@/lib/demo-mode';
import { publicEnv, serverEnv } from '@/lib/env';
import { personaHandle } from '@/lib/handles';
import { isLumaStubbed } from '@/lib/luma-stub';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AiModelRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import type { CreationView } from '@/types/creation';
import type { PersonaOption } from './create-studio';

/** Personas and recent results for Generate (/create) and Canvas (/canvas). */
export async function loadCreateData(limit: number) {
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
        creations = (await listCreations(ws.id, limit)).map((row) => toCreationView(row, personas));
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

  return {
    personas: options,
    creations,
    demoMode,
    disabledReason:
      loadError ?? (lumaConfigured ? null : 'Set LUMA_API_KEY (or LUMA_STUB=1) to render.'),
  };
}
