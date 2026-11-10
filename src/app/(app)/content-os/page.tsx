import Link from 'next/link';
import type { CSSProperties } from 'react';
import {
  AudioLines,
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  CreditCard,
  File,
  FileText,
  Layers,
  Mic,
  Orbit,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Type,
  Video,
  Zap,
} from 'lucide-react';
import { PlatformIcon, type PlatformName } from '@/components/icons/platform-icon';
import { publicEnv } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import {
  DEMO_WORKSPACE_ID,
  getDemoContentJobs,
  getDemoContentPackItems,
  getDemoContentSources,
  isDemoMode,
} from '@/lib/demo-mode';
import { listContentSources, listScheduledPackItems } from '@/lib/content-sources';
import { listActiveContentJobs } from '@/lib/content-jobs';
import type { ContentJobRow, ContentPackItemRow, ContentSourceRow } from '@/lib/supabase/types';
import { CHANNELS } from '@/lib/content-sources-schema';
import { cn } from '@/lib/utils';
import { SourceComposer } from './source-composer';

const SOURCE_STATUS_STYLE: Record<string, string> = {
  uploaded: 'text-ink-muted',
  extracting: 'text-[#0099ff]',
  extracted: 'text-[#0099ff]',
  repackaging: 'text-[#0099ff]',
  ready: 'text-[#22c55e]',
  failed: 'text-[#ff5577]',
};

const SOURCE_TYPES = [Type, FileText, File, AudioLines, Video];
const DISTRIBUTION_PLATFORMS: PlatformName[] = [
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
const HEALTH_ITEMS = [
  { label: 'Zernio', status: 'Connected', icon: Orbit },
  { label: 'Luma', status: 'Connected', icon: Sparkles },
  { label: 'OpenAI', status: 'Connected', icon: BrainCircuit },
  { label: 'Brand safety', status: 'Healthy', icon: ShieldCheck },
  { label: 'Stripe', status: 'Connected', icon: CreditCard },
];

function channelLabel(key: string): string {
  return CHANNELS.find((c) => c.key === key)?.label ?? key;
}

function channelPlatform(key: string): PlatformName | null {
  if (key === 'linkedin') return 'LinkedIn';
  if (key === 'x_thread') return 'X';
  if (key === 'instagram_carousel') return 'Instagram';
  if (key === 'tiktok_reels') return 'TikTok';
  if (key === 'youtube_short') return 'YouTube';
  return null;
}

export default async function ContentOsPage() {
  const demoMode = isDemoMode();
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let workspaceId: string | null = demoMode ? DEMO_WORKSPACE_ID : null;
  let sources: ContentSourceRow[] = [];
  let activeJobs: ContentJobRow[] = [];
  let scheduled: ContentPackItemRow[] = [];
  let loadError: string | null = null;

  if (demoMode) {
    sources = getDemoContentSources();
    activeJobs = getDemoContentJobs();
    scheduled = getDemoContentPackItems().filter((i) => i.status === 'scheduled');
  } else if (supabaseConfigured) {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const ws = await getOrCreateCurrentWorkspace(user);
        workspaceId = ws.id;
        [sources, activeJobs, scheduled] = await Promise.all([
          listContentSources(ws.id),
          listActiveContentJobs(ws.id),
          listScheduledPackItems(ws.id),
        ]);
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Failed to load Content OS.';
    }
  }

  return (
    <div className="app-page content-os-page text-ink">
      <div className="app-page-inner">
        <header className="content-os-command-header">
          <div>
            <div className="content-os-breadcrumb">
              <Layers size={14} />
              ThePlus AI Influencer <span>/</span> Content OS
            </div>
            <h1>Content OS</h1>
            <p>
              <span>Extract</span> → <em>repackage</em> → <strong>distribute</strong>
            </p>
          </div>
          <div className="content-os-top-metrics">
            <div>
              <Zap size={15} />
              <span>Credits</span>
              <strong>12,450</strong>
            </div>
            <div>
              <ShieldCheck size={15} />
              <span>Approval</span>
              <strong>On</strong>
            </div>
          </div>
        </header>

        {loadError ? (
          <p className="mb-4 rounded-[10px] border border-[#ff5577]/40 bg-[#ff5577]/10 px-3 py-2 text-[12px] text-[#ff5577]">
            {loadError}
          </p>
        ) : null}

        <div className="content-os-grid grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-5">
            <section className="content-os-hero">
              <div className="content-os-hero-copy">
                <h2>
                  Drop a source.
                  <br />
                  Build the pack.
                  <br />
                  Approve distribution.
                </h2>
                <p>
                  Paste text, upload files, or record audio/video. We&apos;ll extract what matters
                  and build channel-native content your audience actually wants.
                </p>
                <div className="content-os-source-icons" aria-hidden="true">
                  {SOURCE_TYPES.map((Icon, index) => (
                    <span key={index}>
                      <Icon size={18} />
                    </span>
                  ))}
                </div>
              </div>
              <div className="content-os-composer-frame">
                <SourceComposer workspaceId={workspaceId} demoMode={demoMode} />
              </div>
              <div className="content-os-platform-visual" aria-hidden="true">
                {DISTRIBUTION_PLATFORMS.map((platform, index) => (
                  <span key={platform} style={{ '--i': index } as CSSProperties}>
                    <PlatformIcon platform={platform} />
                  </span>
                ))}
              </div>
            </section>

            <section className="content-os-work-panel">
              <div className="content-os-panel-column">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2>Active jobs</h2>
                  <span>{activeJobs.length}</span>
                </div>
                {activeJobs.length === 0 ? (
                  <p className="content-os-muted">Nothing processing right now.</p>
                ) : (
                  <ul className="content-os-job-list">
                    {activeJobs.map((j, index) => (
                      <li key={j.id}>
                        <div>
                          <FileText size={15} />
                          <span>
                            {sources.find((source) => source.id === j.source_id)?.title ?? j.kind}
                          </span>
                        </div>
                        <div>
                          <span>Extract</span>
                          <span>Repackage</span>
                          <span>Distribute</span>
                        </div>
                        <strong>{index % 2 === 0 ? '40%' : '75%'}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="content-os-panel-column">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2>Recent sources</h2>
                  <span>{sources.length}</span>
                </div>
                {sources.length === 0 ? (
                  <p className="content-os-muted">No sources yet — add one above to start.</p>
                ) : (
                  <ul className="content-os-source-list">
                    {sources.slice(0, 6).map((s) => (
                      <li key={s.id}>
                        <Link href={`/content-os/${s.id}`}>
                          {s.type === 'audio' || s.type === 'video' ? (
                            <Mic size={15} />
                          ) : (
                            <FileText size={15} />
                          )}
                          <span>{s.title}</span>
                          <small className={cn(SOURCE_STATUS_STYLE[s.status] ?? 'text-ink-muted')}>
                            {s.status}
                          </small>
                          <ArrowUpRight size={14} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="content-os-metric-strip">
              {[
                ['Credits available', '12,450'],
                ['Packs approved', '78%'],
                ['Brand safety', '92%'],
                ['Publishing', 'Approval required'],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </section>
          </div>

          <aside className="space-y-5">
            <section className="content-os-side-panel">
              <h2>
                Scheduled queue <span>{scheduled.length}</span>
              </h2>
              {scheduled.length === 0 ? (
                <p className="content-os-muted">No items scheduled yet.</p>
              ) : (
                <ul className="content-os-queue-list">
                  {scheduled.slice(0, 6).map((it) => (
                    <li key={it.id}>
                      <span className="content-os-queue-icon">
                        {channelPlatform(it.channel) ? (
                          <PlatformIcon platform={channelPlatform(it.channel)!} />
                        ) : (
                          <RadioTower size={15} />
                        )}
                      </span>
                      <div>
                        <span>{channelLabel(it.channel)}</span>
                        <small>Scheduled</small>
                      </div>
                      <strong>{it.status}</strong>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/calendar" className="content-os-panel-link">
                Open calendar <ArrowRight size={13} />
              </Link>
            </section>

            <section className="content-os-side-panel">
              <h2>Integrations &amp; health</h2>
              <ul className="content-os-health-list">
                {HEALTH_ITEMS.map(({ label, status, icon: Icon }) => (
                  <li key={label}>
                    <Icon size={16} />
                    <span>{label}</span>
                    <strong>{status}</strong>
                  </li>
                ))}
              </ul>
              <Link href="/settings" className="content-os-panel-link">
                View settings <ArrowRight size={13} />
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
