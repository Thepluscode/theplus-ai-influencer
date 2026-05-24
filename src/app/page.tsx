import Link from 'next/link';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { ThePlusTechBrand } from '@/components/brand/theplus-tech-logo';

export default function LandingPage() {
  return (
    <main className="min-h-dvh bg-[#070707] text-ink">
      <nav className="sticky top-0 z-30 border-b border-[#171717] bg-[#070707]/92 px-6 py-3 backdrop-blur-xl lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[14px] font-medium tracking-tight text-ink"
        >
          <ThePlusTechBrand markClassName="h-7 w-7" />
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="inline-flex h-9 items-center rounded-full px-3.5 text-[12px] font-medium text-ink-muted transition hover:text-ink"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[12px] font-medium text-black transition hover:bg-white/90"
          >
            Get started
            <ArrowUpRight size={11} />
          </Link>
        </div>
      </nav>

      <section className="relative isolate min-h-[calc(100dvh-62px)] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1800&q=80"
          alt=""
          className="absolute inset-0 -z-20 h-full w-full object-cover object-[center_8%]"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(7,7,7,0.96)_0%,rgba(7,7,7,0.72)_46%,rgba(7,7,7,0.30)_100%),linear-gradient(180deg,rgba(7,7,7,0.10)_0%,#070707_100%)]" />

        <div className="flex min-h-[calc(100dvh-62px)] flex-col justify-end px-6 pb-12 pt-16 lg:px-10">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#262626] bg-black/55 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-ink-muted backdrop-blur">
              <Sparkles size={11} className="text-[#0099ff]" />
              AI influencer platform
            </span>
            <h1 className="mt-6 max-w-3xl text-[58px] font-medium leading-[0.96] tracking-normal text-ink sm:text-[76px] lg:text-[92px]">
              ThePlus-tech Influencer
            </h1>
            <p className="mt-5 max-w-xl text-[16px] leading-[1.5] text-ink-muted">
              Cast a synthetic persona, generate cinematic visuals with Luma, plan a 30-day content
              arc, and schedule cross-platform content via Zernio. One dashboard, every channel.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/sign-up"
                className="inline-flex h-12 items-center gap-2 rounded-[12px] bg-[#0099ff] px-6 text-[14px] font-medium text-white shadow-[0_8px_24px_-6px_rgba(0,153,255,0.45)] transition hover:bg-[#1aa6ff] active:scale-[0.99]"
              >
                Get started
                <ArrowUpRight size={14} />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex h-12 items-center rounded-[12px] border border-[#262626] bg-surface-1 px-6 text-[14px] font-medium text-ink transition hover:border-[#444]"
              >
                Open dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-3 px-6 py-10 sm:grid-cols-2 lg:grid-cols-3 lg:px-10">
        <Feature
          title="Studio"
          body="Cast personas with face-locked portrait + full-body rendering."
        />
        <Feature
          title="Series Planner"
          body="LLM-generated 30-day content arcs, one click into Create Post."
        />
        <Feature title="Storyboard" body="Brief → 3-6 shot reel with face-locked Luma renders." />
        <Feature
          title="Captions + Cross-platform"
          body="Per-platform native rewrites in the persona's voice."
        />
        <Feature
          title="Calendar + Zernio"
          body="Schedule + push to every connected platform from one place."
        />
        <Feature title="Analytics" body="Live engagement metrics flowing back from Zernio." />
      </section>

      <footer className="mx-auto w-full max-w-6xl px-6 pb-8 pt-2 text-center lg:px-10">
        <p className="text-[11px] text-[#666]">
          ThePlus-tech · review-grade creative operations for AI influencer campaigns
        </p>
      </footer>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[12px] border border-[#262626] bg-surface-1 p-4">
      <p className="text-[13px] font-medium text-ink">{title}</p>
      <p className="mt-1 text-[12px] leading-[1.4] text-ink-muted">{body}</p>
    </div>
  );
}
