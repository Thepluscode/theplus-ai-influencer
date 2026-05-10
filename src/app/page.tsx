import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <div className="flex max-w-2xl flex-col items-center gap-8 text-center">
        <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
          Coming soon
        </span>
        <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Build, brief, and ship AI influencers — at scale.
        </h1>
        <p className="text-balance text-lg text-zinc-400">
          Create a synthetic persona, generate cinematic visuals with Luma, and
          schedule cross-platform content via Zenio. One dashboard, every channel.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/sign-up"
            className="rounded-md bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-white"
          >
            Get started
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-100 transition hover:border-zinc-700 hover:bg-zinc-800"
          >
            Open dashboard
          </Link>
        </div>
        <p className="pt-4 text-xs text-zinc-600">
          theplus-ai-influencer · scaffold ready · wire your Supabase, Luma,
          Zenio, and Stripe keys in{' '}
          <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-400">
            .env.local
          </code>
        </p>
      </div>
    </main>
  );
}
