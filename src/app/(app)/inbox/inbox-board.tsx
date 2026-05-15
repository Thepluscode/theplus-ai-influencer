'use client';

import { useActionState, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Archive, Check, Clock, Copy, Loader2, MessageSquarePlus, Trash2 } from 'lucide-react';
import {
  addPastedDmAction,
  archiveDmAction,
  deleteDmAction,
  markDmRepliedAction,
  snoozeDmAction,
  type AddDmState,
} from './actions';
import { InsufficientCreditsBanner } from '@/components/credits/insufficient-credits-banner';
import type { AiModelRow, DmThreadRow } from '@/lib/supabase/types';
import { PLATFORMS, type Platform } from '@/types/post';
import { cn } from '@/lib/utils';

const CLASS_TONE: Record<DmThreadRow['classification'], string> = {
  collab: 'bg-[#a855f7]/10 text-[#a855f7] ring-[#a855f7]/30',
  lead: 'bg-[#22c55e]/10 text-[#22c55e] ring-[#22c55e]/30',
  fan: 'bg-[#0099ff]/10 text-[#0099ff] ring-[#0099ff]/30',
  support: 'bg-[#ff7a3d]/10 text-[#ff7a3d] ring-[#ff7a3d]/30',
  spam: 'bg-[#ff5577]/10 text-[#ff5577] ring-[#ff5577]/30',
  other: 'bg-surface-2 text-ink-muted ring-[#262626]',
};

export function InboxBoard({
  dms,
  models,
}: {
  dms: DmThreadRow[];
  models: AiModelRow[];
}) {
  const pending = dms.filter((d) => d.status === 'pending');
  const handled = dms.filter((d) => d.status !== 'pending');

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-6">
        <section>
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Pending · {pending.length}
          </h2>
          {pending.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-[#262626] bg-surface-1/40 px-4 py-8 text-center text-[13px] text-ink-muted">
              Nothing in the queue. Paste a DM on the right →
            </p>
          ) : (
            <ul className="grid gap-3">
              {pending.map((d) => (
                <DmCard key={d.id} dm={d} />
              ))}
            </ul>
          )}
        </section>

        {handled.length > 0 ? (
          <section>
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              Handled · {handled.length}
            </h2>
            <ul className="grid gap-2">
              {handled.map((d) => (
                <li
                  key={d.id}
                  className="flex items-start gap-3 rounded-[12px] border border-[#262626] bg-surface-1 px-3 py-2.5"
                >
                  <span
                    className={cn(
                      'inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium uppercase tracking-wider ring-1',
                      CLASS_TONE[d.classification],
                    )}
                  >
                    {d.classification}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-ink">
                      <span className="text-ink-muted">@{d.author_handle} · {d.platform}:</span>{' '}
                      {d.summary ?? d.last_message}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-[#666]">
                      {d.status} · {formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })}
                    </p>
                  </div>
                  <form action={deleteDmAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <button
                      type="submit"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-muted transition hover:text-[#ff5577]"
                      aria-label="Delete"
                    >
                      <Trash2 size={11} />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <aside className="xl:sticky xl:top-0 xl:self-start">
        <AddDmForm models={models} />
      </aside>
    </div>
  );
}

function DmCard({ dm }: { dm: DmThreadRow }) {
  const [reply, setReply] = useState(dm.suggested_reply ?? '');
  const [copied, setCopied] = useState(false);
  const ignored = dm.classification === 'spam';

  async function copy() {
    if (!reply) return;
    try {
      await navigator.clipboard.writeText(reply);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  return (
    <li className="rounded-[14px] border border-[#262626] bg-surface-1 p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span
          className={cn(
            'inline-flex h-6 items-center rounded-full px-2 font-medium uppercase tracking-wider ring-1',
            CLASS_TONE[dm.classification],
          )}
        >
          {dm.classification}
        </span>
        <span className="text-ink-muted">
          @{dm.author_handle} · {dm.platform} ·{' '}
          {formatDistanceToNow(new Date(dm.created_at), { addSuffix: true })}
        </span>
      </header>

      {dm.summary ? (
        <p className="mb-2 text-[12px] text-ink-muted">
          <span className="text-ink">Summary:</span> {dm.summary}
        </p>
      ) : null}

      <p className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[13px] leading-[1.5] text-ink">
        {dm.last_message}
      </p>

      {!ignored ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Suggested reply
          </p>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            className="w-full rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[13px] text-ink outline-none focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
          />
        </div>
      ) : (
        <p className="mt-3 rounded-[10px] border border-[#ff5577]/30 bg-[#ff5577]/[0.07] px-3 py-2 text-[12px] text-[#ff5577]">
          Marked as <span className="font-medium">spam</span> — no reply suggested. Archive or
          delete.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!ignored ? (
          <>
            <button
              type="button"
              onClick={copy}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-medium transition',
                copied
                  ? 'bg-[#0099ff]/15 text-[#0099ff] ring-1 ring-[#0099ff]/30'
                  : 'bg-[#0099ff] text-white hover:bg-[#1aa6ff]',
              )}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? 'Copied — paste on platform' : 'Copy reply'}
            </button>
            <form action={markDmRepliedAction}>
              <input type="hidden" name="id" value={dm.id} />
              <input type="hidden" name="reply" value={reply} />
              <button
                type="submit"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#262626] bg-surface-2 px-3 text-[11px] font-medium text-ink transition hover:border-[#22c55e]/50 hover:text-[#22c55e]"
              >
                <Check size={11} />
                Mark replied
              </button>
            </form>
            <form action={snoozeDmAction}>
              <input type="hidden" name="id" value={dm.id} />
              <button
                type="submit"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#262626] bg-surface-2 px-3 text-[11px] font-medium text-ink-muted transition hover:border-[#444] hover:text-ink"
              >
                <Clock size={11} />
                Snooze
              </button>
            </form>
          </>
        ) : null}
        <form action={archiveDmAction}>
          <input type="hidden" name="id" value={dm.id} />
          <button
            type="submit"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#262626] bg-surface-2 px-3 text-[11px] font-medium text-ink-muted transition hover:border-[#444] hover:text-ink"
          >
            <Archive size={11} />
            Archive
          </button>
        </form>
      </div>
    </li>
  );
}

function AddDmForm({ models }: { models: AiModelRow[] }) {
  const [state, formAction, pending] = useActionState<AddDmState | null, FormData>(
    addPastedDmAction,
    null,
  );
  const [modelId, setModelId] = useState(models[0]?.id ?? '');
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [authorHandle, setAuthorHandle] = useState('');
  const [messageText, setMessageText] = useState('');

  if (state?.status === 'saved' && messageText !== '') {
    setMessageText('');
    setAuthorHandle('');
  }

  return (
    <div className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
      <header className="mb-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
          Triage a DM
        </h2>
        <p className="mt-1 text-[12px] text-ink-muted">
          Paste an inbound message · 2 credits per triage
        </p>
      </header>
      <form action={formAction} className="flex flex-col gap-3">
        {models.length > 0 ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              Voice (optional)
            </span>
            <select
              name="modelId"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[13px] text-ink outline-none focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
            >
              <option value="">Default brand voice</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Platform
          </span>
          <select
            name="platform"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
            className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[13px] capitalize text-ink outline-none focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Sender handle
          </span>
          <input
            type="text"
            name="authorHandle"
            value={authorHandle}
            onChange={(e) => setAuthorHandle(e.target.value)}
            placeholder="e.g. @brandagency_co"
            required
            className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[13px] text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            DM body
          </span>
          <textarea
            name="messageText"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            rows={5}
            required
            placeholder="Paste the inbound DM. Multiple paragraphs are fine."
            className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[13px] text-ink outline-none focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
          />
        </label>

        {state?.status === 'error' ? (
          <p
            className="rounded-[10px] border border-[#ff5577]/40 bg-[#ff5577]/[0.07] px-3 py-2 text-[12px] text-[#ff5577]"
            role="alert"
          >
            {state.error}
          </p>
        ) : null}
        {state?.status === 'insufficient_credits' ? (
          <InsufficientCreditsBanner balance={state.balance} required={state.required} />
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className={cn(
            'inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-medium text-white transition',
            'bg-[#0099ff] hover:bg-[#1aa6ff] active:scale-[0.99]',
            'shadow-[0_8px_24px_-6px_rgba(0,153,255,0.45)]',
            'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-[#666] disabled:shadow-none',
          )}
        >
          {pending ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Triaging…
            </>
          ) : (
            <>
              <MessageSquarePlus size={13} />
              Triage DM (2 credits)
            </>
          )}
        </button>
      </form>
    </div>
  );
}
