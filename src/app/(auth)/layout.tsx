import Link from 'next/link';
import type { CSSProperties } from 'react';
import { CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { ThePlusTechBrand } from '@/components/brand/theplus-tech-logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page grid min-h-dvh overflow-hidden bg-[#050505] text-ink lg:grid-cols-[minmax(0,1.08fr)_minmax(460px,0.92fr)]">
      <section className="auth-story relative hidden min-h-dvh overflow-hidden px-10 py-8 lg:flex lg:flex-col xl:px-14">
        <Link
          href="/"
          className="relative z-10 inline-flex w-fit items-center gap-2 text-[14px] font-medium tracking-tight text-ink"
        >
          <ThePlusTechBrand />
        </Link>

        <div className="auth-engine-ambient" />
        <div className="auth-engine">
          <div className="auth-engine-core">
            <Sparkles size={22} />
          </div>
          {['Source', 'Atoms', 'Pack', 'Review', 'Calendar'].map((item, index) => (
            <span key={item} style={{ '--i': index } as CSSProperties}>
              {item}
            </span>
          ))}
        </div>

        <div className="relative z-10 my-auto max-w-3xl">
          <h1 className="max-w-[720px] text-[clamp(58px,7.2vw,112px)] font-medium leading-[0.9] tracking-normal text-white">
            Run the content engine.
          </h1>
          <p className="mt-7 max-w-xl text-[18px] leading-[1.58] text-white/58">
            ThePlus.AI Influencer turns source material into approved channel-native media packs,
            then routes them into the calendar without surrendering publishing control.
          </p>
          <div className="mt-10 grid max-w-2xl gap-px border border-white/10 bg-white/10 sm:grid-cols-3">
            {['Extract', 'Repackage', 'Approve'].map((item) => (
              <div key={item} className="bg-black/45 px-4 py-4">
                <CheckCircle2 size={15} className="mb-7 text-[#0099ff]" />
                <p className="text-[13px] font-medium text-white">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-approval-note relative z-10">
          <ShieldCheck size={17} />
          <div>
            <p>Approval required before publishing</p>
            <span>Extract. Repackage. Approve. Publish.</span>
          </div>
        </div>
      </section>

      <section className="auth-form-stage flex min-h-dvh items-center justify-center px-5 py-8 sm:px-7 lg:px-10">
        <div className="auth-form-panel w-full max-w-[440px]">
          <div className="mb-6 flex items-center justify-between gap-3 lg:hidden">
            <Link href="/" className="inline-flex items-center gap-2 text-[14px] font-medium">
              <ThePlusTechBrand />
            </Link>
            <span className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-white/56">
              Content OS
            </span>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
