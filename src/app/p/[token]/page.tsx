import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, Clock3, Download, PlayCircle, Share2 } from 'lucide-react';
import { getPostByShareToken } from '@/lib/posts';
import { listPublicReviewDecisionsForPost } from '@/lib/review-approvals';
import type { ReviewDecision } from '@/lib/review-approvals-schema';
import { listPublicReviewCommentsForPost } from '@/lib/review-comments';
import type { PostRow, ReviewCommentRow, ReviewDecisionRow } from '@/lib/supabase/types';
import { ThePlusTechBrand } from '@/components/brand/theplus-tech-logo';
import { PublicPostDecisionPanel } from '@/components/review/public-post-decision-panel';
import { PublicPostReviewPanel } from '@/components/review/public-post-review-panel';
import { cn } from '@/lib/utils';

interface PageProps {
  params: Promise<{ token: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(token: string) {
  if (!UUID_RE.test(token)) return null;
  try {
    return await getPostByShareToken(token);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const post = await load(token);
  if (!post) {
    return { title: 'Post not found · theplus.ai' };
  }
  const hero = post.variants[0]?.url;
  const description = post.caption?.slice(0, 200) ?? `Made with theplus.ai · ${post.format}`;
  return {
    title: `${post.name} · theplus.ai`,
    description,
    openGraph: {
      title: post.name,
      description,
      type: 'article',
      images: hero ? [{ url: hero, width: 1200, height: 1200, alt: post.name }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.name,
      description,
      images: hero ? [hero] : undefined,
    },
  };
}

export default async function SharedPostPage({ params }: PageProps) {
  const { token } = await params;
  const post = await load(token);
  if (!post) notFound();

  let reviewComments: ReviewCommentRow[] = [];
  let reviewDecisions: ReviewDecisionRow[] = [];
  try {
    reviewComments = await listPublicReviewCommentsForPost(post.id);
  } catch (err) {
    console.error('Failed to load public review comments', err);
  }
  try {
    reviewDecisions = await listPublicReviewDecisionsForPost(post.id);
  } catch (err) {
    console.error('Failed to load public review decisions', err);
  }

  const hero = post.variants[0]?.url;
  const reviewStatus: ReviewDecision = post.review_status || 'needs_changes';
  const reviewVersion = post.review_version || 1;
  const aspect =
    post.format === 'square'
      ? 'aspect-square'
      : post.format === 'portrait'
        ? 'aspect-[9/16]'
        : 'aspect-[16/9]';

  const heroMax =
    post.format === 'landscape'
      ? 'max-w-4xl'
      : post.format === 'portrait'
        ? 'max-w-md'
        : 'max-w-xl';

  return (
    <div className="min-h-dvh bg-[#070707] text-ink">
      <header className="sticky top-0 z-30 border-b border-[#171717] bg-[#070707]/92 px-6 py-3 backdrop-blur-xl lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[14px] font-medium tracking-tight text-ink transition hover:text-ink/80"
          >
            <ThePlusTechBrand markClassName="h-7 w-7" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#22c55e]/12 px-3 text-[11px] font-medium uppercase tracking-wider text-[#86efac] ring-1 ring-[#22c55e]/30">
              <CheckCircle2 size={12} />
              Review link
            </span>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#262626] bg-surface-1 px-3 text-[12px] font-medium text-ink-muted transition hover:border-[#444] hover:text-ink"
            >
              <Download size={12} />
              Download
            </button>
            <Link
              href="/sign-up"
              className="inline-flex h-9 items-center rounded-full bg-white px-4 text-[13px] font-medium text-black transition hover:bg-white/90"
            >
              Build yours
            </Link>
          </div>
        </div>
      </header>

      <main className="grid gap-5 px-6 py-6 lg:px-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-5">
          <div className="overflow-hidden rounded-[18px] border border-[#262626] bg-[#080808]">
            <header className="flex items-center justify-between gap-3 border-b border-[#1a1a1a] px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#666]">
                  Client review
                </p>
                <h1 className="mt-1 text-[18px] font-medium leading-tight tracking-tight text-ink break-words sm:truncate">
                  {post.name}
                </h1>
              </div>
              <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[11px] uppercase tracking-wider text-ink-muted ring-1 ring-[#262626]">
                <Clock3 size={11} />V{reviewVersion}
              </span>
            </header>

            <div className="px-4 py-5">
              <div className={cn('mx-auto w-full', heroMax)}>
                <figure
                  className={cn(
                    'relative w-full overflow-hidden rounded-[14px] border border-[#262626] bg-surface-1',
                    aspect,
                  )}
                >
                  {hero ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={hero} alt={post.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-xs uppercase tracking-wider text-[#444]">
                      no preview
                    </div>
                  )}
                  <span className="absolute bottom-3 left-3 inline-flex h-7 items-center gap-1.5 rounded-full bg-black/60 px-3 text-[11px] font-medium uppercase tracking-wider text-white backdrop-blur">
                    <PlayCircle size={12} />
                    Main asset
                  </span>
                </figure>
              </div>
            </div>
          </div>

          {post.variants.length > 1 ? <CarouselPackage post={post} aspect={aspect} /> : null}

          <ReviewTimeline post={post} aspect={aspect} />
        </section>

        <ShareInspector
          post={post}
          token={token}
          reviewComments={reviewComments}
          reviewDecisions={reviewDecisions}
          reviewStatus={reviewStatus}
          reviewVersion={reviewVersion}
        />
      </main>
    </div>
  );
}

function ShareInspector({
  post,
  token,
  reviewComments,
  reviewDecisions,
  reviewStatus,
  reviewVersion,
}: {
  post: PostRow;
  token: string;
  reviewComments: ReviewCommentRow[];
  reviewDecisions: ReviewDecisionRow[];
  reviewStatus: ReviewDecision;
  reviewVersion: number;
}) {
  return (
    <aside className="flex flex-col gap-5 xl:sticky xl:top-[76px] xl:max-h-[calc(100dvh-96px)] xl:overflow-y-auto">
      <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Metadata
          </h2>
          <Share2 size={14} className="text-[#0099ff]" />
        </div>
        <dl className="grid grid-cols-2 gap-2">
          <Meta label="Format" value={post.format} />
          <Meta label="Variants" value={String(post.variants.length)} />
          <Meta
            label="Platforms"
            value={post.platforms.length > 0 ? post.platforms.join(', ') : 'Social'}
            wide
          />
          <Meta label="Status" value={post.status} />
          <Meta label="Review" value={reviewStatus.replace('_', ' ')} />
          <Meta
            label="Scheduled"
            value={post.scheduled_for ? new Date(post.scheduled_for).toLocaleDateString() : 'Draft'}
          />
        </dl>
      </section>

      <PublicPostDecisionPanel
        token={token}
        status={reviewStatus}
        version={reviewVersion}
        decisions={reviewDecisions}
      />

      <PublicPostReviewPanel
        token={token}
        postName={post.name}
        format={post.format}
        variants={post.variants}
        comments={reviewComments}
      />

      <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          Made with ThePlus-tech
        </p>
        <p className="mt-2 text-[13px] leading-[1.5] text-ink-muted">
          Generate a consistent AI influencer, compose platform-native campaigns, and route creative
          through a review workflow.
        </p>
        <Link
          href="/sign-up"
          className="mt-4 inline-flex h-10 items-center rounded-full bg-white px-4 text-[13px] font-medium text-black transition hover:bg-white/90"
        >
          Try it free
        </Link>
      </section>
    </aside>
  );
}

function CarouselPackage({ post, aspect }: { post: PostRow; aspect: string }) {
  return (
    <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
            Carousel package
          </h2>
          <p className="mt-1 text-[12px] text-[#666]">
            {post.variants.length} review asset{post.variants.length === 1 ? '' : 's'} attached
          </p>
        </div>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#22c55e]/12 px-3 text-[10px] font-medium uppercase tracking-wider text-[#86efac] ring-1 ring-[#22c55e]/30">
          <CheckCircle2 size={11} />
          Package review
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {post.variants.map((variant, index) => (
          <figure
            key={variant.generationId || index}
            className="overflow-hidden rounded-[14px] border border-[#262626] bg-surface-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={variant.url}
              alt={`${post.name} slide ${index + 1}`}
              className={cn(aspect, 'w-full object-cover')}
            />
            <figcaption className="flex items-center justify-between gap-3 p-3">
              <span className="text-[12px] font-medium text-ink">Slide {index + 1}</span>
              <span className="truncate text-[10px] uppercase tracking-wider text-[#666]">
                {variant.generationId || `variant-${index + 1}`}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function ReviewTimeline({ post, aspect }: { post: PostRow; aspect: string }) {
  return (
    <section className="rounded-[16px] border border-[#262626] bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          Review timeline
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-[#666]">Variant markers</span>
      </div>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {post.variants.map((variant, i) => (
          <li
            key={variant.generationId || i}
            className="w-[148px] shrink-0 overflow-hidden rounded-[12px] border border-[#262626] bg-surface-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={variant.url}
              alt={`Variant ${i + 1}`}
              className={cn(aspect, 'w-full object-cover')}
            />
            <div className="flex items-center justify-between gap-2 p-2">
              <span className="text-[11px] font-medium text-ink">V{i + 1}</span>
              <span className="text-[10px] uppercase tracking-wider text-[#666]">00:0{i}:00</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Meta({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[10px] border border-[#262626] bg-surface-2 px-3 py-2',
        wide && 'col-span-2',
      )}
    >
      <dt className="text-[10px] uppercase tracking-wider text-[#666]">{label}</dt>
      <dd className="mt-1 truncate text-[12px] font-medium capitalize text-ink" title={value}>
        {value}
      </dd>
    </div>
  );
}
