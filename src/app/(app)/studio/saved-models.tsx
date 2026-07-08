import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { AiModelRow } from '@/lib/supabase/types';

// Deterministic "Reach est." per model. Real metrics will replace this in
// Phase 4 once analytics ships. Placeholder uses the model id's hash so
// the pill is stable across refreshes (won't flicker between renders).
function reachEstimate(id: string): { low: string; high: string } {
  const hash = simpleHash(id);
  const baseK = 3 + (hash % 12); // 3k – 14k
  const high = baseK + 8 + ((hash >> 4) % 30); // base + 8–37
  return {
    low: `${baseK}.${hash % 10}k`,
    high: `${high}k`,
  };
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function SavedModels({ models }: { models: AiModelRow[] }) {
  if (models.length === 0) {
    return (
      <Link href="/studio/new" className="workflow-empty-state group block px-6 py-10">
        <span className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#0099ff]/15 text-[#0099ff] ring-1 ring-[#0099ff]/30">
          <Plus size={18} />
        </span>
        <p className="text-[14px] font-medium text-ink">Cast your first influencer</p>
        <p className="mt-1 text-[13px] text-ink-muted">
          Define a persona, save it, then brief campaigns against it.
        </p>
      </Link>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {models.map((m) => {
        const reach = reachEstimate(m.id);
        const vibe = m.wizard_input?.vibe ?? 'street';
        return (
          <li key={m.id} className="workflow-media-card group relative overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.portrait_url}
              alt={`${m.name} portrait`}
              className="aspect-[4/5] w-full object-cover transition duration-500 group-hover:scale-[1.04]"
            />
            {/* Vibe badge — top center */}
            <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur">
              {vibe}
            </span>
            {/* Bottom gradient overlay with name + reach */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-3">
              <p
                className="truncate text-[15px] font-semibold leading-tight text-white"
                title={m.name}
              >
                {m.name}
              </p>
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.12em] text-white/80">
                <span>Reach est.</span>
                <span className="rounded bg-black/40 px-1.5 py-0.5 tabular-nums backdrop-blur">
                  {reach.low} – {reach.high}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
