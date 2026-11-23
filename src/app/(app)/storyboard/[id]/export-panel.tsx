'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Download, FileVideo2, Loader2, Lock } from 'lucide-react';
import { exportStoryboardAction, type StoryboardExportState } from '@/app/(app)/storyboard/actions';

type ExportStatus = 'none' | 'queued' | 'rendering' | 'completed' | 'failed';

interface ExportView {
  id: string | null;
  status: ExportStatus;
  reviewVersion: number | null;
  lastError: string | null;
  bytes: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

export function ExportPanel({
  storyboardId,
  currentReviewVersion,
  allAnimated,
  reviewApproved,
  initialExport,
  voiceover,
}: {
  storyboardId: string;
  currentReviewVersion: number;
  allAnimated: boolean;
  reviewApproved: boolean;
  /** Whether this deployment narrates hook captions into exports. */
  voiceover: boolean;
  initialExport: ExportView;
}) {
  const router = useRouter();
  const [actionState, formAction] = useActionState<StoryboardExportState | null, FormData>(
    exportStoryboardAction,
    { status: 'idle' },
  );
  const [view, setView] = useState(initialExport);
  const actionView =
    (actionState?.status === 'queued' || actionState?.status === 'completed') &&
    view.id !== actionState.jobId
      ? {
          ...view,
          id: actionState.jobId,
          status: actionState.status,
          reviewVersion: currentReviewVersion,
          lastError: null,
        }
      : view;
  const canExport = allAnimated && reviewApproved;
  const currentVersionCompleted =
    actionView.status === 'completed' && actionView.reviewVersion === currentReviewVersion;

  useEffect(() => {
    if (actionView.status !== 'queued' && actionView.status !== 'rendering') return;
    let cancelled = false;
    async function tick() {
      try {
        const response = await fetch(
          `/api/jobs/storyboard-export/status?storyboardId=${encodeURIComponent(storyboardId)}`,
          { cache: 'no-store' },
        );
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as {
          id?: string;
          status: ExportStatus;
          reviewVersion?: number;
          lastError?: string | null;
          bytes?: number | null;
          durationMs?: number | null;
          width?: number | null;
          height?: number | null;
        };
        if (next.status === 'none') return;
        setView({
          id: next.id ?? null,
          status: next.status,
          reviewVersion: next.reviewVersion ?? null,
          lastError: next.lastError ?? null,
          bytes: next.bytes ?? null,
          durationMs: next.durationMs ?? null,
          width: next.width ?? null,
          height: next.height ?? null,
        });
        if (next.status === 'completed' || next.status === 'failed') router.refresh();
      } catch {
        // A transient browser/network failure is retried on the next tick.
      }
    }
    void tick();
    const interval = setInterval(tick, 3_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [actionView.status, router, storyboardId]);

  const inFlight = actionView.status === 'queued' || actionView.status === 'rendering';
  const downloadHref =
    actionView.status === 'completed' && actionView.id
      ? `/api/storyboards/${encodeURIComponent(storyboardId)}/exports/${encodeURIComponent(actionView.id)}/download`
      : null;

  return (
    <section id="export" className="workflow-panel p-4">
      <div className="mb-4 flex items-center gap-2">
        <FileVideo2 size={14} className="text-[#22c55e]" />
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          MP4 export
        </h2>
      </div>

      <ExportStatusCard view={actionView} downloadHref={downloadHref} />

      <form action={formAction} className="mt-3 grid gap-2">
        <input type="hidden" name="storyboardId" value={storyboardId} />
        <ExportSubmitButton
          disabled={!canExport || inFlight || currentVersionCompleted}
          canExport={canExport}
          inFlight={inFlight}
          completed={currentVersionCompleted}
        />
        {actionState?.status === 'error' ? (
          <p className="rounded-[10px] border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-[12px] text-[#fca5a5]">
            {actionState.error}
          </p>
        ) : null}
      </form>

      <div className="mt-3 space-y-1 text-[11px] leading-[1.45] text-ink-muted">
        <p>One H.264 MP4 in the storyboard aspect ratio. Assembly costs no extra credits.</p>
        <p>
          New exports burn each shot&apos;s hook caption into the video (Latin script; emoji are
          left out of the on-screen text).
        </p>
        <p>
          {voiceover
            ? 'Each hook caption is narrated over the shot; clip audio is ducked underneath.'
            : 'No voiceover is added. Source clip audio is preserved; silent clips stay silent.'}
        </p>
        <p>No music track is added.</p>
      </div>
    </section>
  );
}

function ExportStatusCard({
  view,
  downloadHref,
}: {
  view: ExportView;
  downloadHref: string | null;
}) {
  if (view.status === 'none') {
    return (
      <p className="rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-ink-muted">
        No rendered MP4 yet.
      </p>
    );
  }
  if (view.status === 'queued' || view.status === 'rendering') {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-[#a855f7]/30 bg-[#a855f7]/10 px-3 py-2 text-[12px] text-[#e9d5ff]">
        <Loader2 size={14} className="animate-spin" />
        {view.status === 'queued' ? 'Queued for MP4 assembly' : 'Rendering the MP4'}
      </div>
    );
  }
  if (view.status === 'failed') {
    return (
      <div className="rounded-[10px] border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-[12px] text-[#fca5a5]">
        <p className="flex items-center gap-2 font-medium">
          <AlertTriangle size={14} /> Export failed
        </p>
        {view.lastError ? <p className="mt-1 text-[#fca5a5]/80">{view.lastError}</p> : null}
      </div>
    );
  }
  return (
    <div className="rounded-[10px] border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-2 text-[12px] text-[#86efac]">
      <p className="flex items-center gap-2 font-medium">
        <CheckCircle2 size={14} /> MP4 ready
      </p>
      {view.width && view.height && view.durationMs ? (
        <p className="mt-1 text-[#86efac]/80">
          {view.width}×{view.height} · {formatDuration(view.durationMs)}
          {view.bytes ? ` · ${formatBytes(view.bytes)}` : ''}
        </p>
      ) : null}
      {downloadHref ? (
        <a
          href={downloadHref}
          className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-[#22c55e] px-3 font-medium text-black transition hover:bg-[#4ade80]"
        >
          <Download size={12} /> Download MP4
        </a>
      ) : null}
    </div>
  );
}

function ExportSubmitButton({
  disabled,
  canExport,
  inFlight,
  completed,
}: {
  disabled: boolean;
  canExport: boolean;
  inFlight: boolean;
  completed: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#22c55e] px-4 text-[13px] font-medium text-black transition hover:bg-[#4ade80] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending || inFlight ? (
        <>
          <Loader2 size={14} className="animate-spin" /> Exporting…
        </>
      ) : completed ? (
        <>
          <CheckCircle2 size={14} /> Current version exported
        </>
      ) : !canExport ? (
        <>
          <Lock size={14} /> Approved animation required
        </>
      ) : (
        <>
          <FileVideo2 size={14} /> Render downloadable MP4
        </>
      )}
    </button>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
