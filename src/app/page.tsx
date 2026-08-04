import Link from 'next/link';
import type { CSSProperties } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Atom,
  AudioWaveform,
  BadgeCheck,
  Blocks,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  PanelsTopLeft,
  Play,
  RadioTower,
  ScanSearch,
  ScanText,
  Send,
  ShieldAlert,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Upload,
} from 'lucide-react';
import { ThePlusTechBrand } from '@/components/brand/theplus-tech-logo';
import { PlatformIcon, type PlatformName } from '@/components/icons/platform-icon';
import { LandingMotion } from '@/components/landing/landing-motion';

const channels: PlatformName[] = [
  'LinkedIn',
  'X',
  'Instagram',
  'TikTok',
  'YouTube',
  'Threads',
  'Facebook',
  'Pinterest',
  'Reddit',
];

const marqueeItems = [...channels, 'Luma', 'Zernio'];

const outputChannels: Array<[PlatformName, string]> = [
  ['LinkedIn', 'Post'],
  ['X', 'Thread'],
  ['Instagram', 'Carousel'],
  ['TikTok', 'Video script'],
  ['YouTube', 'Short script'],
  ['Threads', 'Conversation'],
  ['Facebook', 'Page post'],
  ['Pinterest', 'Idea pin'],
  ['Reddit', 'Community post'],
];

const engineConnectionColours = [
  '#4da6ff',
  '#438fff',
  '#4f7fff',
  '#636cff',
  '#8b5cf6',
  '#b64de9',
  '#d94bd7',
  '#f153b8',
  '#ff765f',
];

const features = [
  {
    title: 'Extract the useful pieces',
    body: 'Paste a founder note, transcript, markdown file, PDF, audio, or video. The pipeline identifies hooks, claims, proof, stories, objections, CTAs, and audience insights.',
    meta: 'Source intelligence',
    icon: ScanText,
  },
  {
    title: 'Repackage for every channel',
    body: 'Generate LinkedIn posts, X threads, carousels, short-form scripts, newsletters, blog/AEO articles, emails, captions, and sales snippets from the same source truth.',
    meta: 'Native output packs',
    icon: Blocks,
  },
  {
    title: 'Publish only after approval',
    body: 'Drafts, visuals, storyboards, calendar items, and Zernio schedules stay behind explicit approval gates. Automation handles the work, not the final judgment.',
    meta: 'Controlled distribution',
    icon: ShieldCheck,
  },
];

const process = [
  {
    step: '01',
    title: 'Add source',
    body: 'Paste raw notes or upload text, PDF, audio, and video files into the Content OS composer.',
    icon: Upload,
  },
  {
    step: '02',
    title: 'Extract atoms',
    body: 'The system structures reusable hooks, claims, stories, proof points, CTAs, and objections.',
    icon: Atom,
  },
  {
    step: '03',
    title: 'Generate pack',
    body: 'Channel-native drafts, visual briefs, storyboard scenes, and captions are generated in one pass.',
    icon: Sparkles,
  },
  {
    step: '04',
    title: 'Approve',
    body: 'Review, edit, and approve with full control before anything reaches a live channel.',
    icon: ShieldCheck,
  },
  {
    step: '05',
    title: 'Schedule & publish',
    body: 'Review every item, then push approved work through Zernio to all connected publishing queues.',
    icon: Send,
  },
];

const proof = [
  ['74%', 'less time spent repurposing content'],
  ['3.2×', 'more content shipped per campaign'],
  ['52%', 'higher engagement across native channels'],
  ['98%', 'approval confidence before publishing'],
];

const trusted = ['PIVOT', 'Arcadia', 'NEXORA', 'LUMEN', 'VECTOR'];

const problemPoints = [
  { icon: Clock3, label: 'Teams waste hours repurposing manually.' },
  { icon: Shuffle, label: 'Messages get diluted across channels.' },
  { icon: AudioWaveform, label: 'Consistency and brand voice break.' },
  { icon: ShieldAlert, label: 'Publishing is fragmented and risky.' },
];

const solutionPoints = [
  { icon: ScanSearch, label: 'Extract reusable content atoms.' },
  { icon: PanelsTopLeft, label: 'Repackage natively for every platform.' },
  { icon: BadgeCheck, label: 'Keep your voice, brand, and intent.' },
  { icon: Send, label: 'Approve once. Publish everywhere.' },
];

const plans = [
  {
    name: 'Launch',
    price: '£149',
    note: 'For operators validating a content engine.',
    items: ['1 workspace', 'Source extraction', 'Multi-channel packs', 'Approval calendar'],
    href: '/sign-up',
  },
  {
    name: 'Studio',
    price: '£499',
    note: 'For brands running always-on AI influencer production.',
    items: ['Content OS', 'Persona studio', 'Storyboard pipeline', 'Zernio scheduling'],
    href: '/sign-up',
    featured: true,
  },
  {
    name: 'Agency',
    price: 'Custom',
    note: 'For teams operating portfolios and client workflows.',
    items: ['Multiple workspaces', 'Review links', 'Brand safety gates', 'Priority implementation'],
    href: '/sign-up',
  },
];

export default function LandingPage() {
  return (
    <main className="landing-page min-h-dvh overflow-hidden bg-[#050505] text-ink">
      <LandingMotion />
      <SiteNav />
      <HeroSection />
      <PlatformMarquee />
      <ProblemSection />
      <FeatureSection />
      <ProofSection />
      <ProcessSection />
      <OfferSection />
      <FinalCta />
    </main>
  );
}

function SiteNav() {
  return (
    <nav className="landing-nav fixed inset-x-0 top-0 z-50 px-4 py-4 sm:px-6 lg:px-8">
      <div className="landing-nav-shell mx-auto flex h-12 max-w-[1380px] items-center justify-between px-4 backdrop-blur-xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-white"
        >
          <ThePlusTechBrand markClassName="h-7 w-7" label="ThePlus.AI" sublabel="Influencer" />
        </Link>
        <div className="hidden items-center gap-7 text-[12px] text-white/58 md:flex">
          <a href="#features" className="transition hover:text-white">
            Product
          </a>
          <a href="#system" className="transition hover:text-white">
            Solutions
          </a>
          <a href="#process" className="transition hover:text-white">
            Resources
          </a>
          <a href="#pricing" className="transition hover:text-white">
            Pricing
          </a>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="hidden h-9 items-center px-3 text-[12px] font-medium text-white/62 transition hover:text-white sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="group inline-flex h-9 items-center gap-2 rounded-full bg-[#1478ff] px-4 text-[12px] font-semibold text-white shadow-[0_16px_50px_-24px_rgba(20,120,255,0.9)] transition hover:bg-[#3691ff]"
          >
            Start building
            <ArrowUpRight
              size={12}
              className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </Link>
        </div>
      </div>
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="landing-hero relative isolate flex min-h-[760px] items-center overflow-hidden px-5 pb-12 pt-24 sm:px-7 lg:px-10">
      <div className="hero-grain" />
      <div className="hero-beam hero-beam-a" />
      <div className="hero-beam hero-beam-b" />

      <div className="landing-hero-grid relative z-10 mx-auto grid w-full max-w-[1500px] items-center">
        <div className="landing-hero-copy max-w-[610px]">
          <div className="hero-signal mb-7">
            <span className="hero-signal-dot" />9 platforms, one push — via Zernio
          </div>
          <h1 className="landing-hero-title text-[clamp(54px,5.7vw,86px)] font-semibold leading-[0.94] tracking-[-0.045em] text-white">
            ThePlus.AI
            <br />
            Influencer
          </h1>
          <div className="hero-subcopy mt-5">
            <p className="max-w-lg text-[21px] leading-[1.22] text-white sm:text-[26px]">
              Turn source content into a <span>distribution engine.</span>
            </p>
            <p className="mt-5 max-w-xl text-[15px] leading-[1.65] text-white/62 sm:text-[16px]">
              Extract. Repackage. Approve. Publish.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up" className="landing-primary-cta group">
                Start building
                <ArrowRight size={16} className="transition group-hover:translate-x-1" />
              </Link>
              <Link href="/content-os" className="landing-secondary-cta group">
                See the workflow
                <Play size={14} className="fill-current" />
              </Link>
            </div>
          </div>
          <div className="trusted-strip">
            <span>Trusted by innovative brands</span>
            <div>
              {trusted.map((item) => (
                <strong key={item}>{item}</strong>
              ))}
            </div>
          </div>
        </div>

        <div className="hero-art-stage">
          <EngineVisual />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-10 mx-auto h-px max-w-[1380px] bg-gradient-to-r from-transparent via-white/18 to-transparent" />
      <div className="hero-scroll-cue" aria-hidden="true">
        <span>Scroll to explore</span>
        <i />
      </div>
    </section>
  );
}

function PlatformMarquee() {
  return (
    <section className="platform-marquee" aria-label="Supported platforms and integrations">
      <div className="platform-marquee-track">
        {[...marqueeItems, ...marqueeItems].map((item, index) => (
          <span key={`${item}-${index}`}>
            {channels.includes(item as PlatformName) ? (
              <PlatformIcon platform={item as PlatformName} />
            ) : null}
            {item}
            <i aria-hidden="true" />
          </span>
        ))}
      </div>
    </section>
  );
}

function EngineVisual({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'engine-visual engine-visual-compact' : 'engine-visual'}>
      <div className="engine-cinematic-art" aria-hidden="true" />
      <div className="engine-connection-mask" aria-hidden="true" />
      <svg
        className="engine-connection-paths"
        viewBox="0 0 1000 680"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <filter id="engine-connection-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {engineConnectionColours.map((colour, index) => {
          const targetY = 77.9 + index * 53;
          const sourceY = 331.2 + index * 9;
          const path = `M 0 ${sourceY} C 360 ${sourceY}, 650 ${targetY}, 1000 ${targetY}`;

          return (
            <g key={outputChannels[index][0]} style={{ color: colour }}>
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                opacity="0.16"
                filter="url(#engine-connection-glow)"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.94"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx="1000" cy={targetY} r="2.5" fill="currentColor" />
            </g>
          );
        })}
      </svg>
      <div className="engine-output-rail">
        {outputChannels.map(([channel, type], index) => (
          <div
            key={channel}
            style={
              {
                '--i': index,
                '--connection': engineConnectionColours[index],
              } as CSSProperties
            }
          >
            <span className="engine-channel-icon">
              <PlatformIcon platform={channel} />
            </span>
            <p>
              <strong>{channel}</strong>
              <small>{type}</small>
            </p>
          </div>
        ))}
      </div>
      <div className="engine-approval">
        <ShieldCheck size={14} />
        Approval required before publishing
      </div>
    </div>
  );
}

function FeatureArtwork({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="feature-slice-art feature-source-art" aria-hidden="true">
        {['Founder interview.mp4', 'Product launch deck.pdf', 'Podcast episode.mp3'].map((item) => (
          <span key={item}>
            <FileText size={13} />
            {item}
          </span>
        ))}
        <i>
          <ScanSearch size={20} />
        </i>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="feature-slice-art feature-channel-art" aria-hidden="true">
        {channels.slice(0, 7).map((channel) => (
          <span key={channel}>
            <PlatformIcon platform={channel} />
          </span>
        ))}
        <div>
          <small>Output</small>
          <strong>LinkedIn post</strong>
          <i />
          <i />
          <i />
        </div>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="feature-slice-art feature-approval-art" aria-hidden="true">
        {outputChannels.slice(0, 4).map(([channel, type], itemIndex) => (
          <span key={channel}>
            <PlatformIcon platform={channel} />
            <strong>{type}</strong>
            <small>{itemIndex === 2 ? 'Needs review' : 'Ready'}</small>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="feature-slice-art feature-publish-art" aria-hidden="true">
      {outputChannels.slice(0, 4).map(([channel, type], itemIndex) => (
        <span key={channel}>
          <PlatformIcon platform={channel} />
          <strong>{type}</strong>
          <small>{10 + itemIndex * 2}:00</small>
        </span>
      ))}
    </div>
  );
}

function ProblemSection() {
  return (
    <section id="system" className="problem-split relative px-5 py-24 sm:px-7 lg:px-10 lg:py-28">
      <div
        className="mx-auto grid max-w-[1380px] gap-10 lg:grid-cols-[0.92fr_0.7fr_0.92fr] lg:items-center"
        data-reveal
      >
        <div>
          <p className="landing-index">The problem</p>
          <h2 className="mt-5 text-[clamp(34px,4.4vw,64px)] font-medium leading-[1] text-white">
            Great content dies in <span className="text-[#2f8cff]">silos.</span>
          </h2>
          <ul className="mt-7 grid gap-3">
            {problemPoints.map(({ icon: Icon, label }) => (
              <li key={label}>
                <Icon size={14} />
                {label}
              </li>
            ))}
          </ul>
        </div>
        <div className="before-after-flow" aria-hidden="true">
          <div className="flow-tangle" />
          <button type="button" tabIndex={-1}>
            <ArrowRight size={15} />
          </button>
          <div className="flow-clean">
            {Array.from({ length: 7 }).map((_, index) => (
              <i key={index} style={{ '--i': index } as CSSProperties} />
            ))}
          </div>
        </div>
        <div>
          <p className="landing-index">The solution</p>
          <h2 className="mt-5 text-[clamp(34px,4.4vw,64px)] font-medium leading-[1] text-white">
            One system. <span className="text-[#2f8cff]">Every channel.</span>
          </h2>
          <ul className="mt-7 grid gap-3">
            {solutionPoints.map(({ icon: Icon, label }) => (
              <li key={label}>
                <Icon size={14} />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function FeatureSection() {
  return (
    <section
      id="features"
      className="landing-feature-section relative px-5 py-24 sm:px-7 lg:px-10 lg:py-32"
    >
      <div className="mx-auto max-w-[1380px]" data-reveal>
        <p className="landing-index text-center">02 / What you can do</p>

        <div className="mt-8 grid gap-5 lg:grid-cols-4">
          {features.map((feature, index) => {
            const FeatureIcon = feature.icon;
            return (
              <article key={feature.title} className="feature-slice">
                <div className="feature-slice-label">
                  <FeatureIcon size={16} />
                  <p>{feature.meta}</p>
                </div>
                <h3>{feature.title}</h3>
                <span>{feature.body}</span>
                <FeatureArtwork index={index} />
              </article>
            );
          })}
          <article className="feature-slice feature-slice-publish">
            <div className="feature-slice-label">
              <RadioTower size={16} />
              <p>Zernio distribution</p>
            </div>
            <h3>Publish everywhere after approval</h3>
            <span>
              Approved work moves through connected accounts with brand safety, scheduling, and
              platform-specific output intact.
            </span>
            <FeatureArtwork index={3} />
          </article>
        </div>
      </div>
    </section>
  );
}

function ProofSection() {
  return (
    <section className="landing-proof-section relative px-5 py-24 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-[1380px] border-y border-white/12 py-12 lg:py-16" data-reveal>
        <div className="proof-heading">
          <div>
            <p className="landing-index">03 / Real results</p>
            <h2 className="mt-5 text-[clamp(38px,4.8vw,76px)] font-medium leading-[0.96] text-white">
              Built for creators. Backed by results.
            </h2>
          </div>
        </div>
        <div className="proof-content">
          <div className="proof-grid">
            {proof.map(([value, label]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="proof-testimonials">
            <blockquote>
              <p>“ThePlus.AI Influencer turned our content chaos into a media machine.”</p>
              <footer>
                <span>SC</span>
                <div>
                  <strong>Sarah Chen</strong>
                  <small>Head of Growth, Pivot</small>
                </div>
              </footer>
            </blockquote>
            <blockquote>
              <p>“We went from one post a week to a full-funnel content engine.”</p>
              <footer>
                <span>ML</span>
                <div>
                  <strong>Marcus Lee</strong>
                  <small>CMO, Arcadia</small>
                </div>
              </footer>
            </blockquote>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProcessSection() {
  return (
    <section
      id="process"
      className="landing-process-section relative px-5 py-24 sm:px-7 lg:px-10 lg:py-32"
    >
      <div className="mx-auto max-w-[1380px]">
        <div className="process-shell" data-reveal>
          <div className="process-copy">
            <p className="landing-index">04 / Interactive process</p>
            <h2>A new workflow for modern teams.</h2>
            <p>
              The system behaves like the content team you used to assemble manually: researcher,
              editor, channel strategist, creative producer, and scheduler.
            </p>
            <Link href="/content-os" className="process-link">
              Open Content OS
              <ChevronRight size={15} />
            </Link>
          </div>
          <div className="process-steps">
            {process.map((item) => {
              const ProcessIcon = item.icon;
              return (
                <article key={item.step}>
                  <span className="process-step-number">{item.step}</span>
                  <span className="process-step-icon">
                    <ProcessIcon size={18} />
                  </span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function OfferSection() {
  return (
    <section
      id="pricing"
      className="landing-offer-section relative px-5 py-24 sm:px-7 lg:px-10 lg:py-32"
    >
      <div className="mx-auto max-w-[1380px]" data-reveal>
        <div className="offer-heading text-center">
          <p className="landing-index">05 / Simple pricing</p>
          <h2>Choose your engine.</h2>
        </div>

        <div className="offer-grid mt-9">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={plan.featured ? 'offer-plan offer-plan-featured' : 'offer-plan'}
            >
              <div>
                <p>{plan.name}</p>
                <strong>{plan.price}</strong>
                <span>{plan.note}</span>
              </div>
              <ul>
                {plan.items.map((item) => (
                  <li key={item}>
                    <Check size={15} />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href={plan.href}>
                Choose {plan.name}
                <ArrowUpRight size={14} />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative px-5 pb-8 pt-20 sm:px-7 lg:px-10">
      <div className="final-cta mx-auto max-w-[1380px] overflow-hidden" data-reveal>
        <div className="final-cta-visual" />
        <div className="final-cta-copy relative z-10">
          <h2>
            Start building your content <span>engine</span> today.
          </h2>
          <p>Everything you need to extract, repackage, approve, and publish.</p>
        </div>
        <div className="final-cta-actions relative z-10">
          <Link href="/sign-up" className="landing-primary-cta group">
            Start building
            <ArrowRight size={16} className="transition group-hover:translate-x-1" />
          </Link>
          <Link href="/content-os" className="landing-secondary-cta">
            See the workflow
            <Play size={14} className="fill-current" />
          </Link>
        </div>
      </div>
    </section>
  );
}
