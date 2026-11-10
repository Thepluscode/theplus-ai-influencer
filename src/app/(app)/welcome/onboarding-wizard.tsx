'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Compass, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CADENCES,
  EXPERIENCE,
  GOALS,
  NAME_MAX,
  NICHES,
  ONBOARDING_PLATFORMS,
  ONBOARDING_VIBES,
  campaignPrefillHref,
  studioPrefillHref,
  type OnboardingAnswers,
} from '@/lib/onboarding';
import type { Platform } from '@/types/post';

const STORAGE_KEY = 'theplus.onboarding.v1';
const STEPS = ['Your goal', 'Your persona', 'Your plan', 'Ready'] as const;

const PLATFORM_LABEL: Record<(typeof ONBOARDING_PLATFORMS)[number], string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  twitter: 'X / Twitter',
};

const DEFAULTS: OnboardingAnswers = {
  goal: 'business',
  experience: 'new',
  name: '',
  niche: 'fashion',
  vibe: 'minimal',
  platforms: ['instagram', 'tiktok'],
  cadence: 'few',
};

function loadSaved(): OnboardingAnswers {
  // Per-browser convenience only: a reload keeps the answers. Nothing depends on it.
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<OnboardingAnswers>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function OnboardingWizard({ personaCost }: { personaCost: number }) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<OnboardingAnswers>(DEFAULTS);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Read saved answers after mount so server and first client render match.
  useEffect(() => {
    const saved = loadSaved();
    if (saved !== DEFAULTS) setA(saved); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
    } catch {
      // storage unavailable: answers simply don't survive a reload
    }
  }, [a]);

  // Move focus to the new step's heading so keyboard and screen-reader users follow along.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const set = <K extends keyof OnboardingAnswers>(k: K, v: OnboardingAnswers[K]) =>
    setA((prev) => ({ ...prev, [k]: v }));
  const togglePlatform = (p: Platform) =>
    set(
      'platforms',
      a.platforms.includes(p) ? a.platforms.filter((x) => x !== p) : [...a.platforms, p],
    );

  const canContinue = step !== 1 || a.name.trim().length > 0;
  const cadenceLabel = CADENCES.find((c) => c.id === a.cadence)?.label ?? '';
  const nicheLabel = NICHES.find((n) => n.id === a.niche)?.label ?? '';
  const displayName = a.name.trim() || 'Your persona';

  return (
    <div>
      <div className="mb-8 flex items-center gap-3" aria-hidden="true">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i <= step ? 'bg-[#0099ff]' : 'bg-[#262626]',
            )}
          />
        ))}
        <span className="text-[11px] tabular-nums text-ink-muted">
          {step + 1}/{STEPS.length}
        </span>
      </div>
      <p className="sr-only" aria-live="polite">
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </p>

      {step === 0 ? (
        <section>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-[32px] font-medium tracking-[-0.02em] text-ink outline-none"
          >
            What are you here to do?
          </h1>
          <p className="mt-1 text-[14px] text-ink-muted">
            Two questions, then we set up your first persona.
          </p>
          <ChoiceGroup
            legend="I want to"
            className="grid gap-3 sm:grid-cols-2"
            options={GOALS.map((g) => ({ id: g.id, label: g.label, hint: g.hint }))}
            value={a.goal}
            onChange={(v) => set('goal', v as OnboardingAnswers['goal'])}
          />
          <ChoiceGroup
            legend="My experience"
            className="grid gap-2"
            options={EXPERIENCE.map((e) => ({ id: e.id, label: e.label }))}
            value={a.experience}
            onChange={(v) => set('experience', v as OnboardingAnswers['experience'])}
          />
        </section>
      ) : null}

      {step === 1 ? (
        <section>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-[32px] font-medium tracking-[-0.02em] text-ink outline-none"
          >
            Who is your persona?
          </h1>
          <p className="mt-1 text-[14px] text-ink-muted">
            You&rsquo;ll choose her look in Studio. Start with a name and a lane.
          </p>
          <label className="mt-6 flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">Name</span>
            <input
              value={a.name}
              maxLength={NAME_MAX}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Audrey"
              autoComplete="off"
              className="w-full rounded-[12px] border border-[#262626] bg-surface-1 px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff]"
            />
          </label>
          <ChoiceGroup
            legend="Niche"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            options={NICHES.map((n) => ({ id: n.id, label: n.label }))}
            value={a.niche}
            onChange={(v) => set('niche', v as OnboardingAnswers['niche'])}
            compact
          />
          <ChoiceGroup
            legend="Vibe"
            className="grid grid-cols-3 gap-2 sm:grid-cols-6"
            options={ONBOARDING_VIBES.map((v) => ({ id: v, label: v }))}
            value={a.vibe}
            onChange={(v) => set('vibe', v as OnboardingAnswers['vibe'])}
            compact
          />
        </section>
      ) : null}

      {step === 2 ? (
        <section>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-[32px] font-medium tracking-[-0.02em] text-ink outline-none"
          >
            Where and how often?
          </h1>
          <p className="mt-1 text-[14px] text-ink-muted">
            This seeds your first campaign plan. You can change it there.
          </p>
          <fieldset className="mt-6">
            <legend className="mb-2 text-[11px] uppercase tracking-[0.1em] text-ink-muted">
              Platforms
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ONBOARDING_PLATFORMS.map((p) => {
                const on = a.platforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    onClick={() => togglePlatform(p)}
                    className={cn(
                      'flex h-12 items-center justify-center gap-1.5 rounded-[12px] border text-[13px] transition',
                      on
                        ? 'border-[#0099ff] bg-[#0099ff]/10 text-ink'
                        : 'border-[#262626] text-ink-muted hover:text-ink',
                    )}
                  >
                    {on ? <Check size={14} /> : null}
                    {PLATFORM_LABEL[p]}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <ChoiceGroup
            legend="Posting rhythm"
            className="grid grid-cols-3 gap-2"
            options={CADENCES.map((c) => ({ id: c.id, label: c.label }))}
            value={a.cadence}
            onChange={(v) => set('cadence', v as OnboardingAnswers['cadence'])}
            compact
          />
        </section>
      ) : null}

      {step === 3 ? (
        <section>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-[32px] font-medium tracking-[-0.02em] text-ink outline-none"
          >
            {displayName} is set up. Next, her face.
          </h1>
          <p className="mt-1 text-[14px] text-ink-muted">
            Nothing has been generated yet. Building her face is the first paid step.
          </p>
          <dl className="mt-6 grid gap-px overflow-hidden rounded-[16px] border border-[#262626] bg-[#262626] sm:grid-cols-2">
            <Summary
              term="Persona"
              detail={`${displayName} · ${nicheLabel} · ${a.vibe.charAt(0).toUpperCase()}${a.vibe.slice(1)}`}
            />
            <Summary
              term="Plan"
              detail={`${cadenceLabel} on ${a.platforms.map((p) => PLATFORM_LABEL[p as keyof typeof PLATFORM_LABEL] ?? p).join(', ') || 'no platform yet'}`}
            />
          </dl>
          <ol className="mt-6 flex flex-col gap-3">
            <NextStep
              n={1}
              href={studioPrefillHref(a)}
              title={`Build ${displayName}'s face in Studio`}
              detail={`A portrait and a full-body shot · ${personaCost} credits`}
              primary
            />
            <NextStep
              n={2}
              href={campaignPrefillHref(a)}
              title="Plan her first campaign"
              detail={`${cadenceLabel} · prefilled from your answers`}
            />
            <NextStep
              n={3}
              href="/dashboard?tour=1"
              title="Take the 60-second tour"
              detail="Where everything lives"
            />
          </ol>
        </section>
      ) : null}

      <div className="mt-10 flex items-center justify-between border-t border-[#262626] pt-5">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface-1 px-4 text-[13px] text-ink ring-1 ring-[#262626] disabled:invisible"
        >
          <ArrowLeft size={14} /> Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canContinue}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-5 text-[13px] font-medium text-black disabled:opacity-40"
          >
            Continue <ArrowRight size={14} />
          </button>
        ) : (
          <Link href="/dashboard" className="text-[13px] text-ink-muted hover:text-ink">
            Skip to dashboard
          </Link>
        )}
      </div>
    </div>
  );
}

function ChoiceGroup({
  legend,
  options,
  value,
  onChange,
  className,
  compact,
}: {
  legend: string;
  options: { id: string; label: string; hint?: string }[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 mt-6 text-[11px] uppercase tracking-[0.1em] text-ink-muted">
        {legend}
      </legend>
      <div role="radiogroup" aria-label={legend} className={className}>
        {options.map((o) => {
          const on = o.id === value;
          return (
            <label
              key={o.id}
              className={cn(
                'flex cursor-pointer flex-col justify-center rounded-[12px] border transition focus-within:ring-2 focus-within:ring-[#0099ff]',
                compact ? 'min-h-12 px-3 py-2 text-center text-[13px] capitalize' : 'px-4 py-3.5',
                on
                  ? 'border-[#0099ff] bg-[#0099ff]/10 text-ink'
                  : 'border-[#262626] text-ink-muted hover:text-ink',
              )}
            >
              <input
                type="radio"
                name={legend}
                value={o.id}
                checked={on}
                onChange={() => onChange(o.id)}
                className="sr-only"
              />
              <span className={cn(compact ? '' : 'text-[14px] font-medium', on && 'text-ink')}>
                {o.label}
              </span>
              {o.hint ? <span className="mt-0.5 text-[12px] text-ink-muted">{o.hint}</span> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Summary({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="bg-surface-1 px-4 py-3.5">
      <dt className="text-[11px] uppercase tracking-[0.1em] text-ink-muted">{term}</dt>
      <dd className="mt-1 text-[14px] text-ink">{detail}</dd>
    </div>
  );
}

function NextStep({
  n,
  href,
  title,
  detail,
  primary,
}: {
  n: number;
  href: string;
  title: string;
  detail: string;
  primary?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={cn(
          'flex items-center gap-4 rounded-[14px] border px-4 py-3.5 transition',
          primary
            ? 'border-white bg-white text-black hover:bg-white/90'
            : 'border-[#262626] bg-surface-1 text-ink hover:bg-[#1a1a1a]',
        )}
      >
        <span
          className={cn(
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-medium',
            primary ? 'bg-black text-white' : 'bg-surface-2 text-ink',
          )}
        >
          {n === 1 ? <Sparkles size={14} /> : n === 3 ? <Compass size={14} /> : n}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium">{title}</span>
          <span className={cn('block text-[12px]', primary ? 'text-black/60' : 'text-ink-muted')}>
            {detail}
          </span>
        </span>
        <ArrowRight size={16} />
      </Link>
    </li>
  );
}
