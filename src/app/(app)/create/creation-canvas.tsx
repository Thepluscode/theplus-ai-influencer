'use client';

import { useEffect, useMemo } from 'react';
import { ArrowUpRight, Plus } from 'lucide-react';
import { layoutCanvas } from '@/lib/canvas';
import type { CreationView } from '@/types/creation';

// ponytail: fixed cells and an automatic tree layout. No drag, pan or zoom;
// add them when boards outgrow a scrollable area.
const CELL_W = 264;
const CELL_H = 340;
const CARD_W = 216;
const CARD_H = 300;
const PAD = 16;

interface Props {
  results: CreationView[];
  demoMode: boolean;
  /** The newest result; scrolled into view when it lands. */
  focusId: string | null;
  onBranch: (c: CreationView) => void;
}

export function CreationCanvas({ results, demoMode, focusId, onBranch }: Props) {
  const layout = useMemo(() => layoutCanvas(results), [results]);
  const byId = useMemo(() => new Map(results.map((c) => [c.id, c])), [results]);
  // Reading order follows creation order, like the layout.
  const ordered = useMemo(
    () => [...results].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [results],
  );

  useEffect(() => {
    if (!focusId) return;
    document
      .getElementById(`canvas-node-${focusId}`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [focusId]);

  if (results.length === 0) {
    return (
      <p className="rounded-[16px] border border-dashed border-[#262626] px-6 py-16 text-center text-[13px] text-ink-muted">
        Nothing on the canvas yet. Generate a picture to place the first card, then use{' '}
        <span className="text-ink">+</span> on its edge to branch an edit from it.
      </p>
    );
  }

  const width = layout.cols * CELL_W + PAD * 2;
  const height = layout.rows * CELL_H + PAD * 2;
  const x = (col: number) => PAD + col * CELL_W;
  const y = (row: number) => PAD + row * CELL_H;

  return (
    <div className="max-h-[75vh] overflow-auto rounded-[16px] border border-[#262626] bg-[#0b0b0b]">
      <div className="relative" style={{ width, height }}>
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          width={width}
          height={height}
        >
          {layout.edges.map((e) => {
            const a = layout.cells.get(e.from)!;
            const b = layout.cells.get(e.to)!;
            const x1 = x(a.col) + CARD_W;
            const y1 = y(a.row) + CARD_H / 2;
            const x2 = x(b.col);
            const y2 = y(b.row) + CARD_H / 2;
            const mid = (x1 + x2) / 2;
            return (
              <path
                key={`${e.from}-${e.to}`}
                d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                fill="none"
                stroke="#0099ff"
                strokeOpacity={0.55}
                strokeWidth={1.5}
              />
            );
          })}
        </svg>
        <ol aria-label="Canvas, oldest first">
          {ordered.map((c) => {
            const cell = layout.cells.get(c.id)!;
            const parent = c.sourceCreationId ? byId.get(c.sourceCreationId) : undefined;
            const canBranch = c.saved || demoMode;
            return (
              <li
                key={c.id}
                id={`canvas-node-${c.id}`}
                className="absolute flex scroll-m-10 flex-col overflow-visible rounded-[14px] border border-[#262626] bg-surface-1"
                style={{ left: x(cell.col), top: y(cell.row), width: CARD_W, height: CARD_H }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.assetUrl}
                  alt={c.prompt}
                  className="h-[176px] w-full rounded-t-[14px] bg-black object-contain"
                />
                <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2.5">
                  <p className="line-clamp-2 text-[12px] text-ink">{c.prompt}</p>
                  <p className="truncate text-[11px] text-ink-muted">
                    {c.mode === 'edit' ? 'Edit' : 'Picture'} · {c.personaName ?? 'no persona'}
                  </p>
                  {c.sourceCreationId ? (
                    <p className="truncate text-[11px] text-[#666]">
                      Branched from: {parent?.prompt ?? 'an earlier result'}
                    </p>
                  ) : null}
                  {!c.saved && !demoMode ? (
                    <p className="text-[11px] text-[#ff7a3d]">Not saved. Download it now.</p>
                  ) : null}
                  <a
                    href={c.assetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto inline-flex w-fit items-center gap-1 text-[11px] text-ink-muted hover:text-ink"
                  >
                    Open <ArrowUpRight size={12} />
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => onBranch(c)}
                  disabled={!canBranch}
                  aria-label={`Branch an edit from: ${c.prompt}`}
                  title="Branch an edit from this result"
                  className="absolute -right-4 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-[#0099ff] text-white shadow-lg ring-4 ring-[#0b0b0b] transition hover:bg-[#33adff] disabled:cursor-not-allowed disabled:bg-[#333]"
                >
                  <Plus size={16} />
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
