'use client';

import { useActionState, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { runSafetyCheckAction, type SafetyState } from './actions';
import { InsufficientCreditsBanner } from '@/components/credits/insufficient-credits-banner';
import { PLATFORMS, type Platform } from '@/types/post';
import { cn } from '@/lib/utils';

export function SafetyForm() {
  const [state, formAction, pending] = useActionState<SafetyState | null, FormData>(
    runSafetyCheckAction,
    null,
  );

  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [platforms, setPlatforms] = useState<Set<Platform>>(new Set(['instagram']));

  function togglePlatform(p: Platform) {
    const next = new Set(platforms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setPlatforms(next);
  }

  return (
    <div className="rounded-[16px] border border-[#262626] bg-surface-1 p-5">
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Caption to audit
          </span>
          <textarea
            name="caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={6}
            required
            placeholder="Paste the caption you're about to ship."
            className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[14px] text-ink outline-none focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Image URL (optional)
          </span>
          <input
            type="url"
            name="imageUrl"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[13px] text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            Target platforms
          </span>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                aria-pressed={platforms.has(p)}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium capitalize transition',
                  platforms.has(p)
                    ? 'bg-[#0099ff]/15 text-[#0099ff] ring-1 ring-[#0099ff]/40'
                    : 'bg-surface-2 text-ink-muted ring-1 ring-[#262626] hover:text-ink',
                )}
              >
                {p}
              </button>
            ))}
          </div>
          {Array.from(platforms).map((p) => (
            <input key={p} type="hidden" name="platforms" value={p} />
          ))}
        </div>

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
          disabled={pending || !caption.trim()}
          className={cn(
            'inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] text-[14px] font-medium text-white transition',
            'bg-[#0099ff] hover:bg-[#1aa6ff] active:scale-[0.99]',
            'shadow-[0_8px_24px_-6px_rgba(0,153,255,0.45)]',
            'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-[#666] disabled:shadow-none',
          )}
        >
          {pending ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Auditing…
            </>
          ) : (
            <>
              <ShieldCheck size={14} />
              Run safety check (2 credits)
            </>
          )}
        </button>
      </form>

      {state?.status === 'success' ? <ResultBlock result={state.result} /> : null}
    </div>
  );
}

function ResultBlock({
  result,
}: {
  result: NonNullable<Extract<SafetyState, { status: 'success' }>['result']>;
}) {
  const verdict = result.verdict;
  const tone =
    verdict === 'pass'
      ? 'border-[#22c55e]/40 bg-[#22c55e]/[0.07] text-[#22c55e]'
      : verdict === 'warn'
        ? 'border-[#ff7a3d]/40 bg-[#ff7a3d]/[0.07] text-[#ff7a3d]'
        : 'border-[#ff5577]/40 bg-[#ff5577]/[0.07] text-[#ff5577]';
  const Icon = verdict === 'pass' ? CheckCircle2 : verdict === 'warn' ? AlertTriangle : ShieldAlert;

  return (
    <div className={cn('mt-5 rounded-[12px] border p-4', tone)}>
      <div className="flex items-center gap-2">
        <Icon size={14} />
        <p className="text-[11px] font-medium uppercase tracking-[0.12em]">Verdict · {verdict}</p>
      </div>
      {result.summary ? <p className="mt-1.5 text-[13px] text-ink">{result.summary}</p> : null}
      {result.issues.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {result.issues.map((issue, i) => (
            <li
              key={i}
              className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[12px] text-ink"
            >
              <p className="flex items-center gap-1.5">
                <span className="inline-flex h-5 items-center rounded-full bg-surface-1 px-2 text-[10px] font-medium uppercase tracking-wider text-ink-muted ring-1 ring-[#262626]">
                  {issue.severity}
                </span>
                <span className="text-ink-muted">{issue.code}</span>
              </p>
              <p className="mt-1.5 text-[13px] text-ink">{issue.message}</p>
              {issue.suggestion ? (
                <p className="mt-1 text-[12px] text-[#0099ff]">→ {issue.suggestion}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
