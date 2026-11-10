import { COSTS } from '@/lib/credits';
import { CreateStudio } from '../create/create-studio';
import { loadCreateData } from '../create/load';

export const dynamic = 'force-dynamic';

// ponytail: the newest 120 results. An edit whose source is older than that
// window is drawn as a root; page by tree when boards get bigger.
const CANVAS_LIMIT = 120;

export default async function CanvasPage() {
  const data = await loadCreateData(CANVAS_LIMIT);
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 md:px-8">
      <header className="mb-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Production
        </p>
        <h1 className="mt-1 text-[32px] font-medium tracking-[-0.02em] text-ink">Canvas</h1>
        <p className="mt-1 text-[14px] text-ink-muted">
          Every picture is a card. Use + on a card&apos;s edge to branch an edit; it lands as a
          connected card.
        </p>
      </header>
      <CreateStudio
        view="canvas"
        personas={data.personas}
        initialCreations={data.creations}
        costs={{ picture: COSTS.CREATE_PICTURE, edit: COSTS.CREATE_EDIT }}
        demoMode={data.demoMode}
        disabledReason={data.disabledReason}
      />
    </div>
  );
}
