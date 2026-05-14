'use client';

import { useActionState, useState } from 'react';
import { format } from 'date-fns';
import { CalendarClock, Check, Link2, Loader2, Send, Save } from 'lucide-react';
import { scheduleAndPublishAction, type SchedulePostState } from './actions';
import { ConnectionsRequired } from '@/components/posts/connections-required';
import type { Platform } from '@/types/post';
import { cn } from '@/lib/utils';

type Mode = 'draft' | 'now' | 'later';

interface Props {
  brief: unknown;
  variants: { url: string }[];
  caption: string;
  /** Platforms the user picked in the form. */
  selectedPlatforms: Platform[];
  /** Platforms the workspace has connected via Zernio. */
  connectedPlatforms: Platform[];
  saveDisabledReason: string | null;
}

/**
 * "Save as draft / Schedule now / Schedule later" panel that appears below
 * the captions panel on Create Post. Mirrors the reference walkthrough:
 *   - radio for mode
 *   - datetime-local input when "later"
 *   - "Connections required" warning when picked platforms aren't connected
 *   - single Confirm CTA, labeled by mode
 */
export function SchedulePanel({
  brief,
  variants,
  caption,
  selectedPlatforms,
  connectedPlatforms,
  saveDisabledReason,
}: Props) {
  const [state, formAction, pending] = useActionState<SchedulePostState | null, FormData>(
    scheduleAndPublishAction,
    null,
  );
  const [mode, setMode] = useState<Mode>('draft');
  const [scheduledFor, setScheduledFor] = useState<string>('');

  const missingConnections = selectedPlatforms.filter((p) => !connectedPlatforms.includes(p));
  const willPublish = mode !== 'draft';
  const blocksOnConnections = willPublish && missingConnections.length > 0;

  const disabled =
    pending ||
    Boolean(saveDisabledReason) ||
    blocksOnConnections ||
    (mode === 'later' && !scheduledFor);

  function ctaLabel(): string {
    if (pending) {
      return mode === 'draft' ? 'Saving…' : mode === 'now' ? 'Publishing…' : 'Scheduling…';
    }
    if (mode === 'draft') return 'Save as draft';
    if (mode === 'now') return 'Publish now';
    return 'Schedule post';
  }

  function chooseMode(next: Mode) {
    setMode(next);
    if (next === 'later' && !scheduledFor) {
      setScheduledFor(getDefaultLater());
    }
  }

  return (
    <div className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
      <header className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 text-[11px] font-medium text-ink ring-1 ring-[#262626]">
          <Send size={11} className="text-[#0099ff]" />
          Ship it
        </span>
        <span className="text-[11px] text-ink-muted">draft, publish now, or schedule</span>
      </header>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="brief" value={JSON.stringify(brief)} />
        <input type="hidden" name="variants" value={JSON.stringify(variants)} />
        <input type="hidden" name="caption" value={caption} />
        <input type="hidden" name="mode" value={mode} />
        {mode === 'later' ? (
          <input type="hidden" name="scheduledFor" value={scheduledFor} />
        ) : null}
        {/* On retry after a partial result, send the existing postId so the
            server reuses the row instead of creating a duplicate draft — and
            short-circuits the Zernio publish if it already went through last
            time. */}
        {state?.status === 'partial' ? (
          <input type="hidden" name="postId" value={state.postId} />
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <ModeRadio
            active={mode === 'draft'}
            onClick={() => chooseMode('draft')}
            icon={<Save size={14} />}
            title="Save draft"
            sub="No publish"
          />
          <ModeRadio
            active={mode === 'now'}
            onClick={() => chooseMode('now')}
            icon={<Send size={14} />}
            title="Publish now"
            sub="To Zernio"
          />
          <ModeRadio
            active={mode === 'later'}
            onClick={() => chooseMode('later')}
            icon={<CalendarClock size={14} />}
            title="Schedule later"
            sub="Pick date"
          />
        </div>

        {mode === 'later' ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              Scheduled for
            </span>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="w-full rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[14px] text-ink outline-none focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
              required
            />
          </label>
        ) : null}

        {/* Connections required — only blocks when publish/schedule mode */}
        {willPublish ? (
          <ConnectionsRequired selected={selectedPlatforms} connected={connectedPlatforms} />
        ) : null}

        <button
          type="submit"
          disabled={disabled}
          title={
            saveDisabledReason ??
            (blocksOnConnections ? 'Connect the missing platforms first.' : undefined)
          }
          className={cn(
            'inline-flex h-12 items-center justify-center gap-2 rounded-[12px] text-[14px] font-medium transition',
            mode === 'draft'
              ? 'bg-surface-2 text-ink ring-1 ring-[#262626] hover:ring-[#444]'
              : 'bg-[#0099ff] text-white hover:bg-[#1aa6ff] shadow-[0_8px_24px_-6px_rgba(0,153,255,0.45)]',
            'active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-[#666] disabled:shadow-none',
          )}
        >
          {pending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : mode === 'draft' ? (
            <Save size={14} />
          ) : mode === 'now' ? (
            <Send size={14} />
          ) : (
            <CalendarClock size={14} />
          )}
          {ctaLabel()}
        </button>

        {state?.status === 'error' ? (
          <p
            className="rounded-[10px] border border-[#ff5577]/40 bg-[#ff5577]/[0.07] px-3 py-2 text-[12px] text-[#ff5577]"
            role="alert"
          >
            {state.error}
          </p>
        ) : null}
        {state?.status === 'saved_draft' ? (
          <p className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[12px] text-ink-muted">
            <Check size={11} className="-mt-px mr-1 inline text-[#22c55e]" />
            Saved as draft · find it in the Calendar shelf.
          </p>
        ) : null}
        {state?.status === 'scheduled' ? (
          <p className="rounded-[10px] border border-[#0099ff]/30 bg-[#0099ff]/[0.07] px-3 py-2 text-[12px] text-ink">
            <Link2 size={11} className="-mt-px mr-1 inline text-[#0099ff]" />
            {state.pushedToZernio
              ? `Scheduled and pushed to connected platforms for ${format(new Date(state.scheduledFor), 'EEE MMM d, h:mm a')}.`
              : `Saved for ${format(new Date(state.scheduledFor), 'EEE MMM d, h:mm a')} — Zernio push skipped.`}
          </p>
        ) : null}
        {state?.status === 'partial' ? (
          <div
            className="rounded-[10px] border border-[#ff7a3d]/40 bg-[#ff7a3d]/[0.07] px-3 py-2 text-[12px] text-[#ff7a3d]"
            role="status"
          >
            <p>{state.warning}</p>
            <p className="mt-1 text-[11px] text-[#ff7a3d]/80">
              Hit the button again — we&apos;ll resume from this draft instead of creating a
              duplicate.
            </p>
          </div>
        ) : null}
      </form>
    </div>
  );
}

function ModeRadio({
  active,
  onClick,
  icon,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex flex-col items-start gap-1 rounded-[12px] border bg-surface-2 px-3 py-2.5 text-left transition',
        active
          ? 'border-[#0099ff] shadow-[0_0_0_1px_rgba(0,153,255,0.25)]'
          : 'border-[#262626] hover:border-[#444]',
      )}
    >
      <span className={cn(active ? 'text-[#0099ff]' : 'text-ink-muted')}>{icon}</span>
      <span className="text-[13px] font-medium text-ink">{title}</span>
      <span className="text-[10px] text-ink-muted">{sub}</span>
    </button>
  );
}

function getDefaultLater(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return format(d, "yyyy-MM-dd'T'HH:mm");
}
