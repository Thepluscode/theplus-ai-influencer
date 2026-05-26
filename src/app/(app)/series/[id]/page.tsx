import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarRange,
  Clock,
  FileText,
  Hash,
  Images,
  Mail,
  SearchCheck,
  Send,
  Sparkles,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { getContentPlan } from '@/lib/content-plans';
import {
  getItemReviewHref,
  getPostReviewLinksForItems,
  type ReviewLinkLookup,
} from '@/lib/content-plan-review-links';
import { publicEnv } from '@/lib/env';
import { listAiModels } from '@/lib/ai-models';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AiModelRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import type { CarouselSlide, ContentPackage, PlanItem } from '@/lib/series-planner';
import { cn } from '@/lib/utils';
import { ContentPackageDrawer } from './content-package-drawer';

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
  const postReviewLinks = await getPostReviewLinksForItems(ws.id, items);
  const seed = (plan.seed_inputs ?? {}) as {
    campaign?: string;
    summary?: string;
    topics?: string[];
    audience?: string;
    deliverables?: string[];
  };
  const models = await listAiModels(ws.id);
  const model: AiModelRow | undefined = plan.model_id
    ? models.find((m) => m.id === plan.model_id)
    : undefined;

  return (
    <div className="app-page text-ink">
      <div className="app-page-inner">
        <header className="app-page-header">
          <Link
            href="/series"
            className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-muted transition hover:text-ink"
          >
            <ArrowLeft size={12} />
            Back to Content Engine
          </Link>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
            <div className="max-w-2xl">
              <p className="framer-eyebrow">{plan.goal} · content engine</p>
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
                {seed.deliverables?.length ? (
                  <Pill>
                    <Sparkles size={11} />
                    {seed.deliverables.length} output types
                  </Pill>
                ) : null}
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
            <PlanItemCard
              key={idx}
              item={item}
              itemIndex={idx}
              planId={plan.id}
              modelId={plan.model_id ?? ''}
              model={model}
              postReviewLinks={postReviewLinks}
            />
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
  itemIndex,
  planId,
  modelId,
  model,
  postReviewLinks,
}: {
  item: PlanItem;
  itemIndex: number;
  planId: string;
  modelId: string;
  model: AiModelRow | undefined;
  postReviewLinks: ReviewLinkLookup;
}) {
  const date = new Date(item.scheduledAt);
  const pkg = item.contentPackage as ContentPackage | undefined;
  const reviewHref = getItemReviewHref(item, postReviewLinks);
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
          <span className="text-[11px] tabular-nums text-[#666]">{format(date, 'HH:mm')}</span>
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
          {pkg ? <ContentPackagePreview pkg={pkg} model={model} /> : null}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider">
            <Tag>{item.format}</Tag>
            <Tag>{item.brandTone}</Tag>
            <Tag>{item.lighting.replace(/_/g, ' ')}</Tag>
            <Tag>{item.cta.replace(/_/g, ' ')}</Tag>
            {pkg?.style ? <Tag>{pkg.style.replace(/_/g, ' ')}</Tag> : null}
            {item.platforms.map((p) => (
              <Tag key={p}>{p}</Tag>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-row flex-wrap gap-2 lg:flex-col">
          <Link
            href={`/create-post?${briefParams.toString()}`}
            className={cn(
              'inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-[12px] font-medium transition',
              'bg-[#0099ff] text-white hover:bg-[#1aa6ff]',
            )}
          >
            <Send size={11} />
            Create social post
            <ArrowUpRight size={11} />
          </Link>
          {pkg ? (
            <ContentPackageDrawer
              planId={planId}
              itemIndex={itemIndex}
              item={item}
              pkg={pkg}
              model={
                model
                  ? {
                      name: model.name,
                      portraitUrl: model.portrait_url,
                    }
                  : null
              }
              createPostHref={`/create-post?${briefParams.toString()}`}
              initialReviewHref={reviewHref}
            />
          ) : null}
        </div>
      </div>
    </li>
  );
}

function ContentPackagePreview({
  pkg,
  model,
}: {
  pkg: ContentPackage;
  model: AiModelRow | undefined;
}) {
  return (
    <div className="mt-4 grid items-start gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <section className="self-start rounded-[12px] border border-[#262626] bg-[#090909] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
            <Images size={12} />
            Carousel
          </p>
          <span className="text-[10px] uppercase tracking-wider text-[#666]">
            {pkg.visualMode.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {pkg.carouselSlides.slice(0, 3).map((slide, index) => (
            <CarouselSlidePreview key={`${slide.title}-${index}`} slide={slide} model={model} />
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <MiniOutput icon={Video} label="Filming script">
          <p className="text-[12px] font-medium text-ink">{pkg.filmingScript.hook}</p>
          <ul className="mt-2 grid gap-1 text-[11px] leading-[1.4] text-ink-muted">
            {pkg.filmingScript.beats.slice(0, 3).map((beat) => (
              <li key={beat}>- {beat}</li>
            ))}
          </ul>
        </MiniOutput>
        <MiniOutput icon={FileText} label="LinkedIn">
          <p className="line-clamp-4 whitespace-pre-wrap text-[11px] leading-[1.45] text-ink-muted">
            {pkg.linkedinPost}
          </p>
        </MiniOutput>
        <div className="grid gap-3 sm:grid-cols-2">
          <MiniOutput icon={Mail} label="Email">
            <p className="text-[12px] font-medium text-ink">{pkg.email.subject}</p>
            <p className="mt-1 line-clamp-2 text-[11px] text-ink-muted">{pkg.email.preview}</p>
          </MiniOutput>
          <MiniOutput icon={SearchCheck} label="SEO / AEO">
            <p className="text-[12px] font-medium text-ink">{pkg.blog.title}</p>
            <p className="mt-1 line-clamp-2 text-[11px] text-ink-muted">
              {pkg.blog.metaDescription}
            </p>
          </MiniOutput>
        </div>
      </section>
    </div>
  );
}

function CarouselSlidePreview({
  slide,
  model,
}: {
  slide: CarouselSlide;
  model: AiModelRow | undefined;
}) {
  const showFace = model && slide.facePlacement !== 'none';
  return (
    <article className="relative min-h-[172px] overflow-hidden rounded-[10px] border border-[#262626] bg-surface-2 p-3">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_15%,rgba(0,153,255,0.24),transparent_34%)]" />
      {showFace ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={model.portrait_url}
            alt=""
            className={cn(
              'absolute bottom-0 h-[74%] w-[46%] object-cover opacity-85',
              slide.facePlacement === 'hero' ? 'right-0' : '-right-4',
            )}
          />
          <span className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-transparent via-black/10 to-[#101010]" />
        </>
      ) : null}
      <div className={cn('relative', showFace ? 'max-w-[62%]' : 'max-w-full')}>
        <span className="text-[10px] font-medium uppercase tracking-wider text-[#79cfff]">
          {slide.facePlacement}
        </span>
        <h4 className="mt-2 text-[13px] font-medium leading-tight text-ink">{slide.title}</h4>
        <p className="mt-2 line-clamp-4 text-[11px] leading-[1.4] text-ink-muted">{slide.copy}</p>
      </div>
    </article>
  );
}

function MiniOutput({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-[#262626] bg-[#090909] p-3">
      <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
        <Icon size={12} />
        {label}
      </p>
      {children}
    </div>
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
