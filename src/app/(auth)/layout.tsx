import Link from 'next/link';
import type { CSSProperties } from 'react';
import { AudioWaveform, FileText, Link2, Play, ShieldCheck, Sparkles, Type } from 'lucide-react';
import { ThePlusTechBrand } from '@/components/brand/theplus-tech-logo';
import { ConnectionOverlay } from '@/components/connection-overlay';
import { PlatformIcon, type PlatformName } from '@/components/icons/platform-icon';

const sourceTypes = [
  { label: 'Text', icon: Type },
  { label: 'Audio', icon: AudioWaveform },
  { label: 'Video', icon: Play },
  { label: 'PDF', icon: FileText },
  { label: 'Links', icon: Link2 },
];
const authChannels: PlatformName[] = [
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
const authConnectionColours = [
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
const authConnectionGeometry = {
  width: 887,
  height: 1045,
  targets: authChannels.map((_, index) => ({ x: 87 + index * 72, y: 698 })),
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page grid min-h-dvh overflow-hidden bg-[#050505] text-ink lg:grid-cols-[minmax(0,1.18fr)_minmax(500px,0.82fr)]">
      <section className="auth-story relative hidden min-h-dvh overflow-hidden px-10 py-8 lg:flex lg:flex-col xl:px-14">
        <Link
          href="/"
          className="relative z-10 inline-flex w-fit items-center gap-2 text-[14px] font-medium tracking-tight text-ink"
        >
          <ThePlusTechBrand label="ThePlus.AI" sublabel="Influencer" />
        </Link>

        <div className="auth-engine-ambient" />
        <div className="auth-source-lanes" aria-hidden="true">
          <p>Source</p>
          {sourceTypes.map(({ label, icon: Icon }, index) => (
            <span key={label} style={{ '--i': index } as CSSProperties}>
              <Icon size={14} />
              {label}
            </span>
          ))}
        </div>
        <div className="auth-engine">
          <div className="auth-engine-core">
            <Sparkles size={22} />
          </div>
          <div className="auth-engine-lines" />
        </div>
        <ConnectionOverlay
          className="auth-channel-connections"
          targetSelector=".auth-channel-dock span > i"
          colours={authConnectionColours}
          sourceX={0.72}
          sourceY={0.57}
          sourceSpread={4}
          initialGeometry={authConnectionGeometry}
        />

        <div className="relative z-10 my-auto max-w-3xl">
          <h1 className="max-w-[680px] text-[clamp(52px,6.2vw,96px)] font-medium leading-[0.9] tracking-normal text-white">
            Run the
            <br />
            content <em>engine.</em>
          </h1>
          <p className="mt-7 text-[20px] leading-[1.35] text-white/64">
            Extract. Repackage. Approve. Publish.
          </p>
          <p className="mt-7 max-w-md text-[15px] leading-[1.7] text-white/55">
            ThePlus.AI Influencer turns any source into multi-channel content packs crafted by AI,
            shaped by your brand, and published only when you approve.
          </p>
          <div className="auth-approval-card">
            <ShieldCheck size={18} />
            <div>
              <p>Approval required before publishing</p>
              <span>You stay in control. Always.</span>
            </div>
          </div>
          <div className="auth-channel-dock" aria-label="Distribution channels">
            {authChannels.map((item) => (
              <span key={item}>
                <i>
                  <PlatformIcon platform={item} />
                </i>
                <small>{item}</small>
              </span>
            ))}
          </div>
          <div className="auth-proof-card">
            <div>
              <strong>10×</strong>
              <span>More output same team</span>
            </div>
            <div>
              <strong>98%</strong>
              <span>Brand-safe first pass</span>
            </div>
            <blockquote>
              “We went from scattered content to a predictable pipeline that compounds.”
            </blockquote>
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
              <ThePlusTechBrand label="ThePlus.AI" sublabel="Influencer" />
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
