import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, ArrowUpRight, CalendarRange, Clock, Hash, Send } from 'lucide-react';
import { getContentPlan } from '@/lib/content-plans';
import { publicEnv } from '@/lib/env';
import { listAiModels } from '@/lib/ai-models';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AiModelRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import type { PlanItem } from '@/lib/series-planner';
import { cn } from '@/lib/utils';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SeriesPlanDetailPage({ params }: Props) {
  const { id } = await params;
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!supabaseConfigured) notFound();

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const ws = await getOrCreateCurrentWorkspace(user);
  const plan = await getContentPlan(id);
  if (!plan || plan.workspace_id !== ws.id) notFound();

  const items = (Array.isArray(plan.items) ? plan.items : []) as PlanItem[];
  const seed = (plan.seed_inputs ?? {}) as { campaign?: string; summary?: string };
  const models = await listAiModels(ws.id);
  const model: AiModelRow | undefined = plan.model_id
    ? models.find((m) => m.id === plan.model_id)
    : undefined;

  return (
    <div className="min-h-full bg-[#070707] text-ink">
      <div className="px-5 py-5 lg:px-6 lg:py-6">
        <header className="mb-8">
          <Link
            href="/series"
            className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-muted transition hover:text-ink"
          >
            <ArrowLeft size={12} />
            Back to Series
          </Link>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
            <div className="max-w-2xl">
              <p className="framer-eyebrow">{plan.goal} · series</p>
              <h1 className="mt-2 text-[28px] font-medium leading-[1.05] tracking-normal text-balance sm:text-[32px]">
                {plan.name}
              </h1>
              {seed.summary ? (
                <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
                  {seed.summary}
                </p>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-2 text-[12px]">
                <Pill>
                  <CalendarRange size={11} />
                  {plan.duration_days} days · {plan.cadence_per_week}/wk
                </Pill>
                <Pill>
                  <Clock size={11} />
                  starts {format(new Date(plan.start_date), 'MMM d, yyyy')}
                </Pill>
                <Pill>
                  <Hash size={11} />
                  {items.length} posts
                </Pill>
                {model ? (
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#0099ff]/10 px-3 text-[12px] font-medium text-[#0099ff] ring-1 ring-[#0099ff]/30">
                    {model.name}
                  </span>
                ) : null}
              </div>
            </div>
            {model ? (
              <aside className="relative w-full max-w-[280px] overflow-hidden rounded-[16px] border border-[#262626] bg-surface-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={model.portrait_url}
                  alt={model.name}
                  className="aspect-[4/5] w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                <p className="absolute inset-x-0 bottom-0 truncate px-3 py-2 text-[13px] font-medium text-white">
                  {model.name}
                </p>
              </aside>
            ) : null}
          </div>
        </header>

        <ul className="grid gap-3">
          {items.map((item, idx) => (
            <PlanItemCard key={idx} item={item} planId={plan.id} modelId={plan.model_id ?? ''} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-1 px-3 text-[12px] text-ink ring-1 ring-[#262626]">
      {children}
    </span>
  );
}

function PlanItemCard({
  item,
  planId,
  modelId,
}: {
  item: PlanItem;
  planId: string;
  modelId: string;
}) {
  const date = new Date(item.scheduledAt);
  const briefParams = new URLSearchParams({
    planId,
    day: String(item.day),
  });
  if (modelId) briefParams.set('modelId', modelId);

  return (
    <li className="rounded-[14px] border border-[#262626] bg-surface-1 p-4 transition hover:border-[#0099ff]/40">
      <div className="grid gap-4 lg:grid-cols-[88px_minmax(0,1fr)_auto] lg:items-start">
        {/* Date badge */}
        <div className="flex items-center gap-3 lg:flex-col lg:items-start">
          <div className="inline-flex flex-col items-center justify-center rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
              {format(date, 'EEE')}
            </span>
            <span className="text-[20px] font-medium leading-none tabular-nums text-ink">
              {format(date, 'd')}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-ink-muted">
              {format(date, 'MMM')}
            </span>
          </div>
          <span
            className={cn(
              'inline-flex h-6 items-center rounded-full px-2 text-[10px] font-medium uppercase tracking-wider',
              'bg-[#0099ff]/10 text-[#0099ff] ring-1 ring-[#0099ff]/30',
            )}
          >
            Day {item.day + 1}
          </span>
        </div>

        {/* Content */}
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">{item.theme}</p>
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.5] text-ink-muted">
            {item.brief}
          </p>
          <div className="mt-3 grid gap-1.5 text-[12px] text-ink-muted sm:grid-cols-2">
            {item.scene ? <DetailRow label="Scene" value={item.scene} /> : null}
            {item.outfit ? <DetailRow label="Outfit" value={item.outfit} /> : null}
            {item.props ? <DetailRow label="Props" value={item.props} /> : null}
            {item.hook ? <DetailRow label="Hook" value={item.hook} /> : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider">
            <Tag>{item.format}</Tag>
            <Tag>{item.brandTone}</Tag>
            <Tag>{item.lighting.replace(/_/g, ' ')}</Tag>
            <Tag>{item.cta.replace(/_/g, ' ')}</Tag>
            {item.platforms.map((p) => (
              <Tag key={p}>{p}</Tag>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-row gap-2 lg:flex-col">
          <Link
            href={`/create-post?${briefParams.toString()}`}
            className={cn(
              'inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-[12px] font-medium transition',
              'bg-[#0099ff] text-white hover:bg-[#1aa6ff]',
            )}
          >
            <Send size={11} />
            Brief campaign
            <ArrowUpRight size={11} />
          </Link>
        </div>
      </div>
    </li>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="truncate" title={`${label}: ${value}`}>
      <span className="mr-1 text-[#666] uppercase tracking-wider">{label}:</span>
      <span className="text-ink">{value}</span>
    </p>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 capitalize text-ink-muted ring-1 ring-[#262626]">
      {children}
    </span>
  );
}
