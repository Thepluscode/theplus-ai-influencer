import { listAiModels } from '@/lib/ai-models';
import { getContentPlan } from '@/lib/content-plans';
import { publicEnv, serverEnv } from '@/lib/env';
import { isLumaStubbed } from '@/lib/luma-stub';
import type { PlanItem } from '@/lib/series-planner';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { AiModelRow, WorkspaceBrandDefaultsRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { fallbackBrandDefaults, getWorkspaceControls } from '@/lib/workspace-controls';
import { getDefaultZernioProfileId, getZernioClient } from '@/lib/zernio';
import { findTrend } from '@/lib/trends/catalog';
import { PLATFORMS, type Platform } from '@/types/post';
import { CreatePostForm, type CreatePostPrefill } from './create-post-form';
import {
  DEMO_CONNECTED_PLATFORMS,
  DEMO_WORKSPACE_ID,
  getDemoBrandDefaults,
  getDemoModels,
  getDemoPostBrief,
  isDemoMode,
} from '@/lib/demo-mode';

interface PageProps {
  searchParams: Promise<{
    planId?: string;
    day?: string;
    modelId?: string;
    trendId?: string;
  }>;
}

export default async function CreatePostPage({ searchParams }: PageProps) {
  const { planId, day, modelId: prefillModelId, trendId } = await searchParams;
  const demoMode = isDemoMode();
  const stubbed = isLumaStubbed();
  const lumaConfigured = stubbed || Boolean(serverEnv.LUMA_API_KEY);
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let models: AiModelRow[] = [];
  let workspaceId: string | null = null;
  let saveDisabledReason: string | null = null;
  let modelsErrorReason: string | null = null;
  let connectedPlatforms: Platform[] = [];
  let prefill: CreatePostPrefill | undefined;
  let brandDefaults: WorkspaceBrandDefaultsRow | undefined;

  if (demoMode) {
    workspaceId = DEMO_WORKSPACE_ID;
    models = getDemoModels();
    connectedPlatforms = DEMO_CONNECTED_PLATFORMS;
    brandDefaults = getDemoBrandDefaults();
    prefill = getDemoPostBrief();
  } else if (!supabaseConfigured) {
    saveDisabledReason = 'Set Supabase env vars in .env.local to enable Save.';
  } else {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        saveDisabledReason = 'Sign in to save your draft.';
      } else {
        const ws = await getOrCreateCurrentWorkspace(user);
        workspaceId = ws.id;
        models = await listAiModels(ws.id);
        brandDefaults = fallbackBrandDefaults(ws.id);

        try {
          const controls = await getWorkspaceControls(ws.id);
          brandDefaults = controls.brandDefaults;
        } catch {
          // Non-fatal — migration 0014 may not be applied yet.
        }

        // Fetch the workspace's connected platforms via Zernio so the
        // platform picker can show "Connected" vs "Connect more" tiles.
        // Best-effort — skip silently if Zernio is unconfigured or the
        // account list errors, so the rest of the page still renders.
        if (serverEnv.ZERNIO_API_KEY) {
          try {
            const profileId = await getDefaultZernioProfileId();
            const accounts = await getZernioClient().listAccounts(profileId);
            const known = new Set(PLATFORMS as readonly string[]);
            const seen = new Set<Platform>();
            for (const a of accounts) {
              const p = a.platform?.toLowerCase();
              if (p && known.has(p)) seen.add(p as Platform);
            }
            connectedPlatforms = Array.from(seen);
          } catch {
            // Non-fatal — the form will surface a "no connected platforms"
            // state if scheduling is attempted later.
          }
        }

        // Hand-off from Trends: pre-fill from the curated catalog. Trends
        // are public so no ownership check needed; model just falls back
        // to the workspace's first persona.
        if (trendId && !prefill) {
          const trend = findTrend(trendId);
          if (trend) {
            prefill = {
              modelId: prefillModelId ?? models[0]?.id ?? null,
              name: `${trend.title}`,
              brief: trend.prefill.brief,
              scene: trend.prefill.scene,
              outfit: trend.prefill.outfit,
              props: trend.prefill.props,
              postGoal: trend.prefill.postGoal,
              lighting: trend.prefill.lighting,
              brandTone: trend.prefill.brandTone,
              cta: trend.prefill.cta,
              platforms: trend.platforms as Platform[],
              format: trend.prefill.format,
            };
          }
        }

        // Hand-off from Content Engine: load the plan item and turn it
        // into a form pre-fill. Validate ownership via the workspace id
        // so a stale URL can't leak across workspaces.
        if (planId && day !== undefined) {
          try {
            const plan = await getContentPlan(planId);
            if (plan && plan.workspace_id === ws.id) {
              const idx = Number(day);
              const items = (Array.isArray(plan.items) ? plan.items : []) as PlanItem[];
              const item = items.find((p) => p.day === idx) ?? items[idx];
              if (item) {
                prefill = {
                  modelId: plan.model_id ?? prefillModelId ?? null,
                  name: `${plan.name} · day ${item.day + 1}`,
                  brief: item.brief,
                  scene: item.scene,
                  outfit: item.outfit,
                  props: item.props,
                  postGoal: item.postGoal,
                  lighting: item.lighting,
                  brandTone: item.brandTone,
                  cta: item.cta,
                  platforms: item.platforms,
                  format: item.format,
                };
              }
            }
          } catch {
            // non-fatal — page renders without pre-fill
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Supabase error';
      modelsErrorReason = message;
      saveDisabledReason =
        'Supabase tables not ready — apply supabase/migrations/0001_initial_schema.sql + 0002_posts.sql.';
    }
  }

  return (
    <div className="app-page text-ink">
      <div className="app-page-inner">
        <header className="app-page-header">
          <p className="framer-eyebrow">Create</p>
          <h1 className="mt-2 text-[28px] font-medium leading-[1.05] tracking-normal text-balance sm:text-[32px]">
            Brief the shoot.
            <br />
            Pick the keeper.
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
            Pick a saved model, give Luma the campaign brief, and review two visual variants. The
            model&apos;s portrait stays locked across renders so the face is consistent.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {demoMode ? (
              <StatusPill
                tone="warn"
                title="Demo workspace — Save lands a fake post; Zernio publish is hard-blocked at the SDK boundary."
              >
                Demo · publish disabled
              </StatusPill>
            ) : stubbed ? (
              <StatusPill tone="info">
                <span className="text-white">LUMA_STUB</span> on · placeholders
              </StatusPill>
            ) : !lumaConfigured ? (
              <StatusPill tone="warn">LUMA_API_KEY missing</StatusPill>
            ) : (
              <StatusPill tone="ok">Luma live</StatusPill>
            )}
            {!supabaseConfigured ? (
              <StatusPill tone="warn">Supabase off · save disabled</StatusPill>
            ) : null}
            {modelsErrorReason ? (
              <StatusPill tone="err" title={modelsErrorReason}>
                Supabase schema not ready
              </StatusPill>
            ) : null}
          </div>
        </header>

        <CreatePostForm
          models={models}
          workspaceId={workspaceId}
          connectedPlatforms={connectedPlatforms}
          saveDisabledReason={saveDisabledReason}
          prefill={prefill}
          brandDefaults={brandDefaults}
        />
      </div>
    </div>
  );
}

function StatusPill({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'warn' | 'err' | 'ok';
  title?: string;
  children: React.ReactNode;
}) {
  const dot = {
    info: 'bg-[#0099ff]',
    warn: 'bg-[#ff7a3d]',
    err: 'bg-[#ff5577]',
    ok: 'bg-[#22c55e]',
  }[tone];
  return (
    <span
      title={title}
      className="inline-flex items-center gap-2 rounded-full bg-surface-1 px-3 py-1.5 text-[12px] text-ink"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}
