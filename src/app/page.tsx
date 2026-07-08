import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Play, Sparkles } from 'lucide-react';
import { ThePlusTechBrand } from '@/components/brand/theplus-tech-logo';

const channels = ['LinkedIn', 'X', 'Instagram', 'TikTok', 'YouTube', 'Newsletter', 'Blog', 'Email'];

const atoms = [
  ['Hook', 'The old content team was a workaround.'],
  ['Claim', 'One source can become a week of distribution.'],
  ['Proof', 'Approval gates keep publishing human-owned.'],
  ['CTA', 'Turn the archive into a campaign engine.'],
];

const features = [
  {
    title: 'Extract the useful pieces',
    body: 'Paste a founder note, transcript, markdown file, PDF, audio, or video. The pipeline identifies hooks, claims, proof, stories, objections, CTAs, and audience insights.',
    meta: 'Source intelligence',
  },
  {
    title: 'Repackage for every channel',
    body: 'Generate LinkedIn posts, X threads, carousels, short-form scripts, newsletters, blog/AEO articles, emails, captions, and sales snippets from the same source truth.',
    meta: 'Native output packs',
  },
  {
    title: 'Publish only after approval',
    body: 'Drafts, visuals, storyboards, calendar items, and Zernio schedules stay behind explicit approval gates. Automation handles the work, not the final judgment.',
    meta: 'Controlled distribution',
  },
];

const process = [
  {
    step: '01',
    title: 'Drop the source',
    body: 'Paste raw notes or upload text, PDF, audio, and video files into the Content OS composer.',
  },
  {
    step: '02',
    title: 'Extract atoms',
    body: 'The system structures reusable hooks, claims, stories, proof points, CTAs, and objections.',
  },
  {
    step: '03',
    title: 'Build the media pack',
    body: 'Channel-native drafts, visual briefs, storyboard scenes, and captions are generated in one pass.',
  },
  {
    step: '04',
    title: 'Approve and schedule',
    body: 'Review every item, then push approved work into the calendar and connected publishing queue.',
  },
];

const proof = [
  ['10+', 'native output formats'],
  ['25 MB', 'source upload ceiling'],
  ['0', 'auto-published items without approval'],
  ['1', 'operating system for source-to-channel'],
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
      <SiteNav />
      <HeroSection />
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
      <div className="mx-auto flex h-12 max-w-[1380px] items-center justify-between border-b border-white/10 bg-black/15 px-1 backdrop-blur-xl">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[13px] font-medium text-white"
        >
          <ThePlusTechBrand markClassName="h-7 w-7" />
        </Link>
        <div className="hidden items-center gap-7 text-[12px] text-white/58 md:flex">
          <a href="#system" className="transition hover:text-white">
            System
          </a>
          <a href="#features" className="transition hover:text-white">
            Features
          </a>
          <a href="#process" className="transition hover:text-white">
            Process
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
            className="group inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[12px] font-semibold text-black shadow-[0_16px_50px_-24px_rgba(255,255,255,0.8)] transition hover:bg-[#dff3ff]"
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
    <section className="landing-hero relative isolate flex min-h-[104dvh] items-end overflow-hidden px-5 pb-10 pt-28 sm:px-7 lg:px-10">
      <div className="hero-grain" />
      <div className="hero-beam hero-beam-a" />
      <div className="hero-beam hero-beam-b" />
      <div className="hero-stage absolute right-[-10vw] top-[13vh] hidden h-[72vh] w-[58vw] min-w-[720px] lg:block">
        <EngineVisual />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-[1380px] items-end gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(460px,0.58fr)]">
        <div className="max-w-[920px]">
          <h1 className="landing-hero-title text-[clamp(58px,8.2vw,126px)] font-medium leading-[0.86] tracking-normal text-white">
            Turn source content into a distribution engine.
          </h1>
          <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,520px)_auto] md:items-end">
            <p className="max-w-xl text-[17px] leading-[1.55] text-white/62 sm:text-[19px]">
              ThePlus.AI Influencer extracts reusable ideas from raw material, repackages them into
              multi-channel media packs, and schedules approved work across every channel.
            </p>
            <div className="flex flex-wrap gap-3 md:justify-end">
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
        </div>

        <div className="relative block lg:hidden">
          <EngineVisual compact />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-10 mx-auto h-px max-w-[1380px] bg-gradient-to-r from-transparent via-white/18 to-transparent" />
    </section>
  );
}

function EngineVisual({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'engine-visual engine-visual-compact' : 'engine-visual'}>
      <div className="engine-orbit" />
      <div className="engine-panel engine-panel-source">
        <span>Source</span>
        <strong>Founder interview</strong>
        <p>42 min transcript · raw notes · product point of view</p>
      </div>
      <div className="engine-core">
        <div className="engine-core-inner">
          <Sparkles size={24} />
          <span>Content OS</span>
        </div>
      </div>
      <div className="engine-panel engine-panel-pack">
        <span>Media pack</span>
        <strong>12 approved drafts</strong>
        <p>captions · carousel · shorts · newsletter · sales snippets</p>
      </div>
      <div className="engine-atoms">
        {atoms.map(([kind, text], index) => (
          <div key={kind} className="engine-atom" style={{ '--i': index } as CSSProperties}>
            <small>{kind}</small>
            <span>{text}</span>
          </div>
        ))}
      </div>
      <div className="engine-channel-ring">
        {channels.map((channel, index) => (
          <span key={channel} style={{ '--i': index } as CSSProperties}>
            {channel}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProblemSection() {
  return (
    <section id="system" className="relative px-5 py-24 sm:px-7 lg:px-10 lg:py-32">
      <div className="mx-auto grid max-w-[1380px] gap-14 lg:grid-cols-[0.84fr_1.16fr] lg:items-start">
        <div className="lg:sticky lg:top-28">
          <p className="landing-index">01 / The operating gap</p>
          <h2 className="mt-5 max-w-[680px] text-[clamp(44px,6vw,96px)] font-medium leading-[0.92] text-white">
            The bottleneck was never ideas. It was repackaging.
          </h2>
        </div>
        <div className="grid gap-5 pt-2">
          <EditorialPanel tone="dark">
            <span>Before</span>
            <strong>Every channel demanded a separate content team.</strong>
            <p>
              Long-form source material became a manual queue: extract the point, rewrite the hook,
              brief the visual, format the caption, check the brand voice, then schedule it again.
            </p>
          </EditorialPanel>
          <EditorialPanel tone="light">
            <span>Now</span>
            <strong>One source becomes a controlled distribution system.</strong>
            <p>
              AI handles extraction, transformation, and draft production while the operator keeps
              approval, safety, timing, and final publishing control.
            </p>
          </EditorialPanel>
        </div>
      </div>
    </section>
  );
}

function EditorialPanel({ tone, children }: { tone: 'dark' | 'light'; children: ReactNode }) {
  return <div className={`editorial-panel editorial-panel-${tone}`}>{children}</div>;
}

function FeatureSection() {
  return (
    <section id="features" className="relative px-5 py-24 sm:px-7 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-[1380px]">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
          <div>
            <p className="landing-index">02 / Feature system</p>
            <h2 className="mt-5 max-w-2xl text-[clamp(42px,5.4vw,88px)] font-medium leading-[0.94] text-white">
              Built like a studio. Operated like software.
            </h2>
          </div>
          <p className="max-w-2xl text-[17px] leading-[1.6] text-white/58 lg:justify-self-end">
            Studio, Create, Storyboard, Calendar, and Content OS are not separate tools. They are
            one production path from raw source to scheduled campaign inventory.
          </p>
        </div>

        <div className="mt-16 grid gap-5 lg:grid-cols-[1.22fr_0.78fr]">
          <div className="feature-cinema">
            <div className="feature-cinema-header">
              <span>Live pack</span>
              <strong>Extract. Repackage. Approve. Publish.</strong>
            </div>
            <div className="feature-timeline">
              {['Source', 'Atoms', 'Drafts', 'Media', 'Review', 'Schedule'].map((item, index) => (
                <div key={item} className="feature-timeline-node">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{item}</strong>
                </div>
              ))}
            </div>
            <div className="feature-output-grid">
              {channels.slice(0, 6).map((channel) => (
                <div key={channel}>
                  <small>{channel}</small>
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          </div>

          <div className="feature-stack">
            {features.map((feature) => (
              <article key={feature.title} className="feature-slice">
                <p>{feature.meta}</p>
                <h3>{feature.title}</h3>
                <span>{feature.body}</span>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProofSection() {
  return (
    <section className="relative px-5 py-24 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-[1380px] border-y border-white/12 py-12 lg:py-16">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="landing-index">03 / Results without losing control</p>
            <h2 className="mt-5 text-[clamp(38px,4.8vw,76px)] font-medium leading-[0.96] text-white">
              More output. Fewer handoffs. No blind autopilot.
            </h2>
          </div>
          <div className="proof-grid">
            {proof.map(([value, label]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProcessSection() {
  return (
    <section id="process" className="relative px-5 py-24 sm:px-7 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-[1380px]">
        <div className="process-shell">
          <div className="process-copy">
            <p className="landing-index">04 / Interactive process</p>
            <h2>From archive to calendar in one supervised loop.</h2>
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
            {process.map((item) => (
              <article key={item.step}>
                <span>{item.step}</span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function OfferSection() {
  return (
    <section id="pricing" className="relative px-5 py-24 sm:px-7 lg:px-10 lg:py-32">
      <div className="mx-auto max-w-[1380px]">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div>
            <p className="landing-index">05 / Offer</p>
            <h2 className="mt-5 max-w-3xl text-[clamp(42px,5.2vw,86px)] font-medium leading-[0.94] text-white">
              Production capacity without hiring the whole content desk.
            </h2>
          </div>
          <p className="max-w-2xl text-[17px] leading-[1.6] text-white/58 lg:justify-self-end">
            Start with a focused workspace, then scale into persona generation, storyboards,
            scheduling, review rooms, and multi-workspace operating cadence.
          </p>
        </div>

        <div className="offer-grid mt-14">
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
      <div className="final-cta mx-auto max-w-[1380px] overflow-hidden">
        <div className="final-cta-visual" />
        <div className="relative z-10 max-w-5xl">
          <p className="landing-index">06 / Start the system</p>
          <h2>Stop feeding channels one post at a time.</h2>
          <p>
            Build the workflow that extracts once, repackages everywhere, and keeps distribution
            approval-owned.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/sign-up" className="landing-primary-cta group">
              Start building
              <ArrowRight size={16} className="transition group-hover:translate-x-1" />
            </Link>
            <Link href="/dashboard" className="landing-secondary-cta">
              Open dashboard
            </Link>
          </div>
        </div>
        <div className="final-cta-footer">
          <span>ThePlus.AI Influencer</span>
          <span>Content OS · Studio · Create · Calendar · Review</span>
        </div>
      </div>
    </section>
  );
}
