'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clapperboard,
  Clock3,
  FileText,
  Film,
  Flag,
  History,
  ImageIcon,
  Mic,
  Music,
  Palette,
  Play,
  RefreshCw,
  Save,
  SearchCheck,
  Send,
  Sparkles,
  Volume2,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreativeAgentRunPayload } from '@/lib/creative-agents-schema';
import {
  markCreativeAgentIssueFixedAction,
  saveCreativeAgentRunAction,
  sendCreativeAgentRunToStoryboardAction,
} from './actions';

export type BrandDefaultsSeed = {
  brandTone: string;
  brandVibe: string;
  brandPalette: string;
  defaultCta: string;
};

type RecentCreativeRun = {
  id: string;
  campaign_title: string;
  concept_line: string;
  agent_status: 'saved' | 'sent_to_storyboard';
  asset_count: number;
  fixed_issue_count: number;
  storyboard_id: string | null;
  created_at: string;
};

type AgentKey =
  | 'strategy'
  | 'script'
  | 'visuals'
  | 'audio'
  | 'identity'
  | 'render'
  | 'review'
  | 'compose';

type AgentConfig = {
  key: AgentKey;
  title: string;
  icon: LucideIcon;
  accent: string;
  model: string;
};

type Shot = {
  index: number;
  title: string;
  frame: string;
  camera: string;
  prompt: string;
  audio: string;
  qualityGate: string;
};

type ReviewIssue = {
  id: string;
  severity: 'fixing' | 'clear';
  asset: string;
  label: string;
  before: string;
  fix: string;
};

type CreativeRun = {
  campaignTitle: string;
  conceptLine: string;
  script: string[];
  voiceover: string[];
  musicCue: string;
  soundDesign: string[];
  brandIdentity: string[];
  shots: Shot[];
  reviewIssues: ReviewIssue[];
  composeNotes: string[];
  assetCount: number;
};

const AGENTS: AgentConfig[] = [
  {
    key: 'strategy',
    title: 'Concept Strategist',
    icon: Sparkles,
    accent: '#0099ff',
    model: 'GPT-5 creative director',
  },
  {
    key: 'script',
    title: 'Script Writer',
    icon: FileText,
    accent: '#22c55e',
    model: 'Long-form copy model',
  },
  {
    key: 'visuals',
    title: 'Visual Director',
    icon: Clapperboard,
    accent: '#ff7a3d',
    model: 'Cinematic image model',
  },
  {
    key: 'audio',
    title: 'Audio Producer',
    icon: Volume2,
    accent: '#a855f7',
    model: 'Voice + music router',
  },
  {
    key: 'identity',
    title: 'Brand System',
    icon: Palette,
    accent: '#ff5577',
    model: 'Identity synthesis model',
  },
  {
    key: 'render',
    title: 'Keyframe Renderer',
    icon: ImageIcon,
    accent: '#79cfff',
    model: 'Best model per frame',
  },
  {
    key: 'review',
    title: 'Review Agent',
    icon: SearchCheck,
    accent: '#facc15',
    model: 'Visual consistency critic',
  },
  {
    key: 'compose',
    title: 'Composer',
    icon: Film,
    accent: '#ffffff',
    model: 'Remotion assembly',
  },
];

const PRESETS = [
  {
    label: 'Borrowed time',
    prompt:
      'Create an ad for a luxury watch brand around the concept of borrowed time. It should feel cinematic, restrained, precise, and emotionally sharp.',
  },
  {
    label: 'Midnight launch',
    prompt:
      'Create a product launch film for a black electric fragrance called Midnight Signal. Make it tactile, premium, and made for short-form social.',
  },
  {
    label: 'Founder cut',
    prompt:
      'Create a founder-led brand film for an AI studio that gives creators a full production team from one prompt. Make it fast, credible, and premium.',
  },
] as const;

function formatLabel(value: string): string {
  return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatRunStamp(value: string): string {
  const [date, rest = ''] = value.split('T');
  return `${date} ${rest.slice(0, 5)}`.trim();
}

function detectSubject(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes('watch')) return 'luxury watch';
  if (lower.includes('fragrance')) return 'electric fragrance';
  if (lower.includes('studio')) return 'AI production studio';
  if (lower.includes('shoe') || lower.includes('sneaker')) return 'performance sneaker';
  if (lower.includes('skincare')) return 'skincare ritual';
  return 'premium product';
}

function detectConcept(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes('borrowed time')) return 'borrowed time';
  if (lower.includes('midnight')) return 'midnight signal';
  if (lower.includes('founder')) return 'the one-prompt studio';
  const sentence = prompt.split(/[.!?]/)[0]?.trim();
  return sentence ? sentence.slice(0, 68) : 'cinematic launch system';
}

function buildCreativeRun(prompt: string, brandDefaults: BrandDefaultsSeed): CreativeRun {
  const subject = detectSubject(prompt);
  const concept = detectConcept(prompt);
  const tone = formatLabel(brandDefaults.brandTone);
  const cta = formatLabel(brandDefaults.defaultCta);

  const shots: Shot[] = [
    {
      index: 1,
      title: 'Cold open',
      frame: 'A dark macro surface with the product barely visible under a moving strip of light.',
      camera: '90mm macro, locked-off, 40 percent speed ramp',
      prompt: `${tone} ${subject} macro still, ${concept}, black glass, controlled reflection, no extra logos, ${brandDefaults.brandPalette}`,
      audio: 'Single room-tone swell, distant mechanical tick',
      qualityGate: 'Logo geometry, product silhouette, highlight continuity',
    },
    {
      index: 2,
      title: 'Human tension',
      frame:
        'A hand pauses before touching the product, as if deciding whether to spend the moment.',
      camera: 'Handheld close pass, shallow depth, slight parallax',
      prompt: `${subject} ad keyframe, hand hovering, cinematic restraint, ${brandDefaults.brandVibe}, premium editorial lighting`,
      audio: 'Soft breath, low felt pulse, cloth movement',
      qualityGate: 'Finger count, product scale, skin reflection',
    },
    {
      index: 3,
      title: 'Proof detail',
      frame: 'The hero detail locks into focus and becomes the visual proof point.',
      camera: 'Focus pull from foreground edge to product face',
      prompt: `hero detail of ${subject}, exact indices, clean symmetry, ${concept}, crisp material finish, no warped text`,
      audio: 'Precise click, sub bass stop, metallic tail',
      qualityGate: 'Dial indices, text legibility, material consistency',
    },
    {
      index: 4,
      title: 'Final claim',
      frame: 'The product rests in negative space while the campaign line resolves.',
      camera: 'Slow push, centered product, 2 second hold',
      prompt: `${subject} final packshot, luxury negative space, ${brandDefaults.brandPalette}, premium shadows, ${cta} end frame`,
      audio: 'Music resolves to one clean tone, no clutter',
      qualityGate: 'CTA safe area, crop, platform legibility',
    },
  ];

  return {
    campaignTitle: `${formatLabel(concept)} - ${formatLabel(subject)}`,
    conceptLine:
      subject === 'luxury watch'
        ? 'Time is not owned. It is borrowed, measured, and returned with interest.'
        : `A ${tone.toLowerCase()} campaign system around ${concept}.`,
    script: [
      'Open on absence: no face, no logo, only the pressure of the moment.',
      `Reveal the ${subject} as the object that makes the abstract idea physical.`,
      'Hold long enough for the viewer to feel the decision instead of reading it.',
      `Close with a clean ${cta.toLowerCase()} frame and a two-second platform-safe hold.`,
    ],
    voiceover: [
      'We never own the hour.',
      'We only choose what it remembers.',
      'Borrowed time. Worn with intent.',
    ],
    musicCue:
      'Sparse piano felt through tape saturation, 72 BPM, sub pulse enters only after the proof detail.',
    soundDesign: [
      'Mechanical tick treated as percussion, never literal clock noise.',
      'Soft cloth movement under the hand pause.',
      'Single precision click on the proof detail.',
      'Final low-air release under the CTA.',
    ],
    brandIdentity: [
      `Tone: ${tone}.`,
      `Vibe: ${brandDefaults.brandVibe || 'cinematic, premium, creator-led'}.`,
      `Palette: ${brandDefaults.brandPalette || 'electric blue, signal green, warm neutrals'}.`,
      'Typography: compressed uppercase labels, quiet body copy, no decorative flourishes.',
      'Motion rule: every cut must feel earned, never flashy.',
    ],
    shots,
    reviewIssues: [
      {
        id: 'dial-indices',
        severity: 'fixing',
        asset: 'Shot 03 proof detail',
        label:
          subject === 'luxury watch' ? 'Inconsistent dial indices' : 'Micro-detail inconsistency',
        before:
          subject === 'luxury watch'
            ? 'Generated frame has uneven minute markers at 2 and 7 o clock.'
            : 'Generated frame has inconsistent product edge alignment.',
        fix:
          subject === 'luxury watch'
            ? 'Regenerate with explicit index symmetry and lock the dial crop.'
            : 'Regenerate with stricter geometry and edge continuity.',
      },
      {
        id: 'cta-safe',
        severity: 'clear',
        asset: 'Final compose',
        label: 'CTA safe area verified',
        before: 'All platform overlays tested against portrait and square crops.',
        fix: 'No fix needed.',
      },
    ],
    composeNotes: [
      '16:9 master plus portrait crop can be generated from the same shot order.',
      'Use 18 frame audio pre-roll so the first tick lands before the first visual reveal.',
      'Keep review comments attached to shot index and version number.',
      'Send approved storyboard to Remotion assembly after review clears.',
    ],
    assetCount: 4 + 4 + 3 + 4 + 5 + shots.length,
  };
}

export function CreativeAgentsLab({
  brandDefaults,
  recentRuns,
  historyError,
  actionError,
}: {
  brandDefaults: BrandDefaultsSeed;
  recentRuns: RecentCreativeRun[];
  historyError: string | null;
  actionError: string | null;
}) {
  const [prompt, setPrompt] = useState<string>(PRESETS[0].prompt);
  const [selectedAgent, setSelectedAgent] = useState<AgentKey>('strategy');
  const [fixedIssues, setFixedIssues] = useState<Record<string, boolean>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [saveState, saveFormAction, savePending] = useActionState(saveCreativeAgentRunAction, null);

  const run = useMemo(() => buildCreativeRun(prompt, brandDefaults), [brandDefaults, prompt]);
  const activeAgent = AGENTS.find((agent) => agent.key === selectedAgent) ?? AGENTS[0];
  const ActiveAgentIcon = activeAgent.icon;
  const openIssues = run.reviewIssues.filter(
    (issue) => issue.severity === 'fixing' && !fixedIssues[issue.id],
  );
  const fixedIssueIds = useMemo(
    () => Object.entries(fixedIssues).flatMap(([id, fixed]) => (fixed ? [id] : [])),
    [fixedIssues],
  );
  const payload = useMemo<CreativeAgentRunPayload>(
    () => ({ prompt, brandDefaults, run, fixedIssueIds }),
    [brandDefaults, fixedIssueIds, prompt, run],
  );
  const payloadJson = useMemo(() => JSON.stringify(payload), [payload]);
  const currentSaveState =
    saveState?.status === 'success' && saveState.prompt === prompt ? saveState : null;
  const currentSaveError =
    saveState?.status === 'error' && (!saveState.prompt || saveState.prompt === prompt)
      ? saveState.error
      : null;

  function rerunAgents(nextPrompt = prompt) {
    setPrompt(nextPrompt);
    setFixedIssues({});
    setIsRunning(true);
    window.setTimeout(() => setIsRunning(false), 850);
  }

  function markIssueFixed(id: string) {
    setFixedIssues((current) => ({ ...current, [id]: true }));
  }

  return (
    <div className="app-page text-ink">
      <div className="grid min-h-[calc(100dvh-65px)] xl:grid-cols-[minmax(0,1fr)_380px]">
        <main className="min-w-0 border-r border-[#171717]">
          <div className="app-detail-header px-5 py-5 lg:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-3xl">
                <p className="framer-eyebrow">Creative Agents</p>
                <h1 className="mt-2 text-[28px] font-medium leading-[1.05] tracking-normal text-balance sm:text-[34px]">
                  One prompt.
                  <br />
                  Full production stack.
                </h1>
                <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
                  Agents split a campaign brief into production assets, route each task to the right
                  specialist model, and run a review pass before storyboard handoff.
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href="/storyboard/new"
                  className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#262626] bg-surface-1 px-3.5 text-[12px] font-medium text-ink transition hover:border-[#0099ff]/50"
                >
                  <Film size={13} />
                  Storyboard
                </Link>
                <Link
                  href="/create-post"
                  className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-white px-3.5 text-[12px] font-medium text-black transition hover:bg-white/90"
                >
                  <ArrowRight size={13} />
                  Create post
                </Link>
              </div>
            </div>
          </div>

          <section className="grid gap-5 px-5 py-5 lg:px-6">
            <div className="grid gap-3 rounded-[16px] border border-[#262626] bg-surface-1 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                    Command
                  </p>
                  <p className="mt-1 text-[13px] text-ink-muted">
                    Active brand defaults: {formatLabel(brandDefaults.brandTone)} tone.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => rerunAgents(preset.prompt)}
                      className={cn(
                        'h-8 rounded-full border px-3 text-[11px] font-medium transition',
                        prompt === preset.prompt
                          ? 'border-[#0099ff]/50 bg-[#0099ff]/12 text-[#79cfff]'
                          : 'border-[#262626] bg-surface-2 text-ink-muted hover:border-[#444] hover:text-ink',
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={4}
                className="min-h-[112px] resize-none rounded-[12px] border border-[#262626] bg-[#0b0b0b] px-3 py-3 text-[14px] leading-[1.55] text-ink outline-none placeholder:text-[#666] focus:border-[#0099ff] focus:shadow-[0_0_0_1px_rgba(0,153,255,0.25)]"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[12px] text-ink-muted">
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      isRunning ? 'animate-pulse bg-[#0099ff]' : 'bg-[#22c55e]',
                    )}
                  />
                  {isRunning ? 'Agents running in parallel' : `${run.assetCount} assets staged`}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={saveFormAction}>
                    <input type="hidden" name="payload" value={payloadJson} />
                    <button
                      type="submit"
                      disabled={savePending || isRunning || prompt.trim().length === 0}
                      className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#262626] bg-surface-2 px-3.5 text-[12px] font-medium text-ink transition hover:border-[#0099ff]/50 disabled:cursor-not-allowed disabled:text-[#666]"
                    >
                      <Save size={13} />
                      {savePending ? 'Saving' : currentSaveState ? 'Saved' : 'Save run'}
                    </button>
                  </form>
                  <form action={sendCreativeAgentRunToStoryboardAction}>
                    <input type="hidden" name="payload" value={payloadJson} />
                    {currentSaveState ? (
                      <input type="hidden" name="runId" value={currentSaveState.runId} />
                    ) : null}
                    <button
                      type="submit"
                      disabled={isRunning || prompt.trim().length === 0}
                      className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-white px-3.5 text-[12px] font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-[#666]"
                    >
                      <Send size={13} />
                      Send to Storyboard
                    </button>
                  </form>
                  <button
                    type="button"
                    onClick={() => rerunAgents()}
                    disabled={isRunning || prompt.trim().length === 0}
                    className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[#0099ff] px-4 text-[13px] font-medium text-white shadow-[0_8px_24px_-6px_rgba(0,153,255,0.45)] transition hover:bg-[#1aa6ff] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-[#666] disabled:shadow-none"
                  >
                    {isRunning ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Wand2 size={13} />
                    )}
                    Run agents
                  </button>
                </div>
              </div>
              {actionError ? (
                <p className="rounded-[10px] border border-[#ff7a3d]/30 bg-[#ff7a3d]/10 px-3 py-2 text-[12px] leading-[1.4] text-[#ffb38a]">
                  {actionError}
                </p>
              ) : null}
              {currentSaveState ? (
                <p className="rounded-[10px] border border-[#22c55e]/25 bg-[#22c55e]/10 px-3 py-2 text-[12px] leading-[1.4] text-[#86efac]">
                  {currentSaveState.message} Review fixes can now persist against this run.
                </p>
              ) : null}
              {currentSaveError ? (
                <p className="rounded-[10px] border border-[#ff7a3d]/30 bg-[#ff7a3d]/10 px-3 py-2 text-[12px] leading-[1.4] text-[#ffb38a]">
                  {currentSaveError}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {AGENTS.map((agent, index) => (
                <AgentTile
                  key={agent.key}
                  agent={agent}
                  active={agent.key === selectedAgent}
                  done={!isRunning || index < 2}
                  assetCount={agent.key === 'visuals' || agent.key === 'render' ? 4 : 2}
                  onSelect={() => setSelectedAgent(agent.key)}
                />
              ))}
            </div>

            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="rounded-[16px] border border-[#262626] bg-surface-1">
                <div className="border-b border-[#1b1b1b] px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                    Production Assets
                  </p>
                </div>
                <div className="grid gap-0 divide-y divide-[#1a1a1a]">
                  <AssetBlock icon={Flag} title={run.campaignTitle} items={[run.conceptLine]} />
                  <AssetBlock icon={FileText} title="Script" items={run.script} />
                  <AssetBlock icon={Mic} title="Voiceover" items={run.voiceover} />
                  <AssetBlock
                    icon={Music}
                    title="Music + SFX"
                    items={[run.musicCue, ...run.soundDesign]}
                  />
                  <AssetBlock icon={Palette} title="Brand identity" items={run.brandIdentity} />
                </div>
              </section>

              <aside className="grid gap-5">
                <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                      Review Agent
                    </p>
                    <span
                      className={cn(
                        'inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-medium uppercase tracking-wider ring-1',
                        openIssues.length
                          ? 'bg-[#ff7a3d]/12 text-[#ffb38a] ring-[#ff7a3d]/30'
                          : 'bg-[#22c55e]/12 text-[#86efac] ring-[#22c55e]/30',
                      )}
                    >
                      <SearchCheck size={10} />
                      {openIssues.length ? `${openIssues.length} fix` : 'clear'}
                    </span>
                  </div>
                  <div className="grid gap-2">
                    {run.reviewIssues.map((issue) => {
                      const fixed = fixedIssues[issue.id] || issue.severity === 'clear';
                      const persistedRunId = currentSaveState?.runId ?? null;
                      const persistedIssueId = currentSaveState?.issueIds[issue.id] ?? null;
                      return (
                        <div
                          key={issue.id}
                          className="rounded-[12px] border border-[#262626] bg-surface-2 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[13px] font-medium text-ink">{issue.label}</p>
                              <p className="mt-0.5 text-[11px] uppercase tracking-wider text-[#666]">
                                {issue.asset}
                              </p>
                            </div>
                            <span
                              className={cn(
                                'inline-flex h-6 items-center rounded-full px-2 text-[10px] font-medium uppercase tracking-wider',
                                fixed
                                  ? 'bg-[#22c55e]/12 text-[#86efac]'
                                  : 'bg-[#ff7a3d]/12 text-[#ffb38a]',
                              )}
                            >
                              {fixed ? 'fixed' : 'queued'}
                            </span>
                          </div>
                          <p className="mt-2 text-[12px] leading-[1.45] text-ink-muted">
                            {issue.before}
                          </p>
                          <p className="mt-1 text-[12px] leading-[1.45] text-ink">{issue.fix}</p>
                          {!fixed && persistedRunId && persistedIssueId ? (
                            <form
                              action={markCreativeAgentIssueFixedAction}
                              onSubmit={() => markIssueFixed(issue.id)}
                            >
                              <input type="hidden" name="runId" value={persistedRunId} />
                              <input type="hidden" name="issueId" value={persistedIssueId} />
                              <button
                                type="submit"
                                className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-white px-3 text-[11px] font-medium text-black transition hover:bg-white/90"
                              >
                                <CheckCircle2 size={12} />
                                Apply fix
                              </button>
                            </form>
                          ) : !fixed ? (
                            <button
                              type="button"
                              onClick={() => markIssueFixed(issue.id)}
                              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-white px-3 text-[11px] font-medium text-black transition hover:bg-white/90"
                            >
                              <CheckCircle2 size={12} />
                              Apply fix
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                    Final Compose
                  </p>
                  <ul className="mt-3 grid gap-2">
                    {run.composeNotes.map((note) => (
                      <li
                        key={note}
                        className="flex gap-2 text-[12px] leading-[1.45] text-ink-muted"
                      >
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0099ff]" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </aside>
            </div>

            <section className="rounded-[16px] border border-[#262626] bg-surface-1">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1b1b1b] px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                  Storyboard Keyframes
                </p>
                <span className="text-[11px] text-[#666]">
                  4 keyframes ready for render routing
                </span>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
                {run.shots.map((shot) => (
                  <ShotCard key={shot.index} shot={shot} />
                ))}
              </div>
            </section>
          </section>
        </main>

        <aside className="hidden min-w-0 bg-[#090909] xl:block">
          <div className="sticky top-0 grid max-h-[calc(100dvh-65px)] gap-5 overflow-y-auto p-5">
            <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="framer-eyebrow">Inspector</p>
                  <h2 className="mt-2 text-[20px] font-medium tracking-normal text-ink">
                    {activeAgent.title}
                  </h2>
                </div>
                <span
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full ring-1"
                  style={{
                    backgroundColor: `${activeAgent.accent}1f`,
                    color: activeAgent.accent,
                    borderColor: `${activeAgent.accent}40`,
                  }}
                >
                  <ActiveAgentIcon size={16} />
                </span>
              </div>

              <dl className="mt-5 grid gap-2">
                <InspectorRow label="Model" value={activeAgent.model} />
                <InspectorRow
                  label="Status"
                  value={
                    isRunning ? 'Routing' : openIssues.length ? 'Review fixes queued' : 'Ready'
                  }
                />
                <InspectorRow label="Brand tone" value={formatLabel(brandDefaults.brandTone)} />
                <InspectorRow label="Default CTA" value={formatLabel(brandDefaults.defaultCta)} />
              </dl>
            </section>

            <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                Model Routing
              </p>
              <div className="mt-3 grid gap-2">
                {[
                  ['Copy', 'language model'],
                  ['Keyframes', 'image specialist'],
                  ['Voice', 'voiceover model'],
                  ['Music', 'contextual music model'],
                  ['Review', 'visual QA model'],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-3 rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2"
                  >
                    <span className="text-[12px] text-ink">{label}</span>
                    <span className="text-[11px] text-ink-muted">{value}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                  Run History
                </p>
                <History size={13} className="text-[#666]" />
              </div>
              <div className="mt-3 grid gap-2">
                {historyError ? (
                  <p className="rounded-[10px] border border-[#ff7a3d]/25 bg-[#ff7a3d]/10 px-3 py-2 text-[12px] leading-[1.4] text-[#ffb38a]">
                    {historyError}
                  </p>
                ) : recentRuns.length > 0 ? (
                  recentRuns.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[12px] border border-[#262626] bg-surface-2 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-medium text-ink">
                            {item.campaign_title}
                          </p>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-[1.4] text-ink-muted">
                            {item.concept_line}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-[#111] px-2 py-1 text-[10px] uppercase tracking-wider text-[#888] ring-1 ring-[#262626]">
                          {formatLabel(item.agent_status)}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-[#666]">
                        <span>
                          {item.asset_count} assets / {item.fixed_issue_count} fixes
                        </span>
                        <span>{formatRunStamp(item.created_at)}</span>
                      </div>
                      {item.storyboard_id ? (
                        <Link
                          href={`/storyboard/${item.storyboard_id}`}
                          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-[9px] border border-[#262626] px-3 text-[11px] font-medium text-ink transition hover:border-[#0099ff]/50"
                        >
                          Open Storyboard
                          <ArrowRight size={11} />
                        </Link>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2 text-[12px] leading-[1.4] text-ink-muted">
                    No saved agent runs yet.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
                Handoff
              </p>
              <div className="mt-3 grid gap-2">
                <form action={sendCreativeAgentRunToStoryboardAction}>
                  <input type="hidden" name="payload" value={payloadJson} />
                  {currentSaveState ? (
                    <input type="hidden" name="runId" value={currentSaveState.runId} />
                  ) : null}
                  <button
                    type="submit"
                    disabled={isRunning || prompt.trim().length === 0}
                    className="inline-flex h-10 w-full items-center justify-between rounded-[10px] bg-white px-3 text-[12px] font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-[#666]"
                  >
                    Send current run
                    <Send size={12} />
                  </button>
                </form>
                <Link
                  href="/storyboard/new"
                  className="inline-flex h-10 items-center justify-between rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[12px] font-medium text-ink transition hover:border-[#0099ff]/50"
                >
                  Storyboard builder
                  <ArrowRight size={12} />
                </Link>
                <Link
                  href="/safety"
                  className="inline-flex h-10 items-center justify-between rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[12px] font-medium text-ink transition hover:border-[#0099ff]/50"
                >
                  Safety review
                  <ArrowRight size={12} />
                </Link>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}

function AgentTile({
  agent,
  active,
  done,
  assetCount,
  onSelect,
}: {
  agent: AgentConfig;
  active: boolean;
  done: boolean;
  assetCount: number;
  onSelect: () => void;
}) {
  const Icon = agent.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group min-h-[116px] rounded-[16px] border bg-surface-1 p-4 text-left transition',
        active
          ? 'border-[#0099ff]/60 shadow-[0_0_0_1px_rgba(0,153,255,0.18)]'
          : 'border-[#262626] hover:border-[#444]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-[11px] ring-1"
          style={{
            backgroundColor: `${agent.accent}1f`,
            color: agent.accent,
            borderColor: `${agent.accent}33`,
          }}
        >
          <Icon size={15} />
        </span>
        <span
          className={cn(
            'inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-medium uppercase tracking-wider',
            done ? 'bg-[#22c55e]/12 text-[#86efac]' : 'bg-[#0099ff]/12 text-[#79cfff]',
          )}
        >
          {done ? <CheckCircle2 size={10} /> : <Clock3 size={10} />}
          {done ? 'done' : 'run'}
        </span>
      </div>
      <p className="mt-3 text-[14px] font-medium text-ink">{agent.title}</p>
      <p className="mt-1 text-[12px] text-ink-muted">
        {assetCount} assets - {agent.model}
      </p>
    </button>
  );
}

function AssetBlock({
  icon: Icon,
  title,
  items,
}: {
  icon: LucideIcon;
  title: string;
  items: string[];
}) {
  return (
    <div className="grid gap-3 px-4 py-4 md:grid-cols-[180px_minmax(0,1fr)]">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-surface-2 text-[#79cfff] ring-1 ring-[#262626]">
          <Icon size={13} />
        </span>
        <p className="text-[13px] font-medium text-ink">{title}</p>
      </div>
      <ul className="grid gap-2">
        {items.map((item) => (
          <li key={item} className="text-[13px] leading-[1.5] text-ink-muted">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ShotCard({ shot }: { shot: Shot }) {
  return (
    <article className="overflow-hidden rounded-[14px] border border-[#262626] bg-surface-2">
      <div className="relative aspect-[9/16] bg-[#0d0d0d]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(0,153,255,0.28),transparent_36%),linear-gradient(180deg,#151515,#050505)]" />
        <div className="absolute inset-x-8 bottom-16 h-32 rounded-full border border-white/10 bg-black/40 shadow-[0_0_50px_rgba(0,153,255,0.18)]" />
        <div className="absolute left-3 top-3 inline-flex h-7 items-center gap-1.5 rounded-full bg-black/60 px-2 text-[10px] font-medium text-white backdrop-blur">
          <Play size={10} />
          {String(shot.index).padStart(2, '0')}
        </div>
        <div className="absolute inset-x-3 bottom-3">
          <p className="text-[13px] font-medium text-white">{shot.title}</p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-[1.35] text-white/65">{shot.frame}</p>
        </div>
      </div>
      <div className="grid gap-3 p-3">
        <MetaLine icon={Clapperboard} label="Camera" value={shot.camera} />
        <MetaLine icon={Music} label="Audio" value={shot.audio} />
        <MetaLine icon={SearchCheck} label="Gate" value={shot.qualityGate} />
      </div>
    </article>
  );
}

function MetaLine({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-2">
      <Icon size={12} className="mt-0.5 shrink-0 text-[#666]" />
      <p className="min-w-0 text-[11px] leading-[1.4] text-ink-muted">
        <span className="text-ink">{label}:</span> {value}
      </p>
    </div>
  );
}

function InspectorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wider text-[#666]">{label}</dt>
      <dd className="truncate text-right text-[12px] text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}
