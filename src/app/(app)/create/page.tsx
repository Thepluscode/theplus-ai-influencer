import { COSTS } from '@/lib/credits';
import { CREATIONS_PAGE_SIZE } from '@/lib/creations';
import { CreateStudio } from './create-studio';
import { loadCreateData } from './load';

// Per-user results and credit-gated actions: never prerender, even when the
// build runs without Supabase env (which would otherwise freeze an empty page).
export const dynamic = 'force-dynamic';

export default async function CreatePage() {
  const data = await loadCreateData(CREATIONS_PAGE_SIZE);
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
        personas={data.personas}
        initialCreations={data.creations}
        costs={{ picture: COSTS.CREATE_PICTURE, edit: COSTS.CREATE_EDIT }}
        demoMode={data.demoMode}
        disabledReason={data.disabledReason}
      />
    </div>
  );
}
