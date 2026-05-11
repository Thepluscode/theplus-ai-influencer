import { formatDistanceToNow } from 'date-fns';
import type { AiModelRow } from '@/lib/supabase/types';

export function SavedModels({ models }: { models: AiModelRow[] }) {
  if (models.length === 0) {
    return (
      <section className="mb-10 rounded-lg border border-dashed border-zinc-800 bg-zinc-950/50 px-6 py-10 text-center">
        <p className="text-sm text-zinc-400">
          No saved AI models yet. Generate one below and click <strong>Save model</strong>.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-10">
      <header className="mb-4 flex items-end justify-between gap-4">
        <h2 className="text-sm uppercase tracking-wide text-zinc-500">Your AI models</h2>
        <span className="text-xs text-zinc-600">{models.length} saved</span>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {models.map((m) => (
          <li
            key={m.id}
            className="group overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.portrait_url}
              alt={`${m.name} portrait`}
              className="aspect-[3/4] w-full object-cover transition group-hover:opacity-90"
            />
            <div className="flex items-baseline justify-between gap-2 px-3 py-2.5">
              <span className="truncate text-sm font-medium text-zinc-100" title={m.name}>
                {m.name}
              </span>
              <span className="shrink-0 text-xs text-zinc-500">
                {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
