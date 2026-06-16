import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { ThePlusTechBrand } from '@/components/brand/theplus-tech-logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-[#070707] text-ink lg:grid-cols-2 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden border-r border-[#171717] bg-[radial-gradient(circle_at_20%_10%,rgba(0,153,255,0.16),transparent_28%),linear-gradient(180deg,#070707,#0b0b0b)] px-10 py-8 lg:flex lg:flex-col">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 text-[14px] font-medium tracking-tight text-ink"
        >
          <ThePlusTechBrand />
        </Link>

        <div className="my-auto max-w-xl">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#666]">
            Review-grade creative ops
          </p>
          <h1 className="mt-4 max-w-lg text-[52px] font-medium leading-[1.02] tracking-normal text-ink">
            Cast the persona. Route the review. Ship the campaign.
          </h1>
          <div className="mt-8 grid max-w-md gap-2">
            {['Anchored review comments', 'Approval decision log', 'Luma render gating'].map(
              (item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-[12px] border border-[#262626] bg-surface-1 px-3 py-2 text-[13px] text-ink-muted"
                >
                  <CheckCircle2 size={13} className="text-[#86efac]" />
                  {item}
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-6 py-10">
        <div className="w-full max-w-[390px] rounded-[18px] border border-[#262626] bg-surface-1 p-6 shadow-[0_30px_80px_-50px_rgba(0,0,0,0.9)]">
          <div className="mb-6 flex items-center justify-between gap-3 lg:hidden">
            <Link href="/" className="inline-flex items-center gap-2 text-[14px] font-medium">
              <ThePlusTechBrand />
            </Link>
            <span className="rounded-full bg-[#22c55e]/12 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[#86efac] ring-1 ring-[#22c55e]/30">
              Review OS
            </span>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
