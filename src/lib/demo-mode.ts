import 'server-only';
import { serverEnv } from '@/lib/env';
import type {
  AiModelRow,
  PostRow,
  WorkspaceBrandDefaultsRow,
  WorkspaceRow,
} from '@/lib/supabase/types';
import type { CaptionsResult, PlatformVariant } from '@/lib/captions';
import type { InfluencerVisuals, InfluencerWizardInput } from '@/types/influencer';
import type { Platform, PostBriefInput, PostVariant } from '@/types/post';
import type { ZernioAccount } from '@/lib/zernio';

export const DEMO_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
export const DEMO_USER_EMAIL = 'demo@theplus.ai';
export const DEMO_MODEL_ID = '00000000-0000-4000-8000-000000000101';
export const DEMO_POST_ID = '00000000-0000-4000-8000-000000000201';

export function isDemoMode(): boolean {
  return serverEnv.THEPLUS_DEMO_MODE === true && process.env.NODE_ENV !== 'production';
}

export function getDemoWorkspace(): WorkspaceRow {
  const now = new Date('2026-05-26T09:00:00.000Z').toISOString();
  return {
    id: DEMO_WORKSPACE_ID,
    owner_user_id: '00000000-0000-4000-8000-000000000011',
    name: 'ThePlus Demo Studio',
    credits: 1250,
    plan: 'studio',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    plan_renews_at: null,
    created_at: now,
    updated_at: now,
  };
}

const demoInput: InfluencerWizardInput = {
  name: 'Aria Vance',
  gender: 'woman',
  bodyType: 'athletic',
  skinTone: 'olive',
  ageRange: '25-34',
  hair: 'long espresso waves with soft curtain bangs',
  vibe: 'cinematic',
  customPrompt: 'confident London streetwear creator, premium wellness brand energy',
};

export function getDemoModels(): AiModelRow[] {
  return [
    {
      id: DEMO_MODEL_ID,
      workspace_id: DEMO_WORKSPACE_ID,
      name: demoInput.name,
      wizard_input: demoInput,
      portrait_url:
        'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80',
      full_body_url:
        'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80',
      portrait_generation_id: 'demo_portrait_aria',
      full_body_generation_id: 'demo_fullbody_aria',
      created_at: new Date('2026-05-24T10:00:00.000Z').toISOString(),
    },
  ];
}

export const DEMO_CONNECTED_PLATFORMS: Platform[] = ['instagram', 'tiktok', 'youtube'];

export function getDemoAccounts(): ZernioAccount[] {
  return DEMO_CONNECTED_PLATFORMS.map((platform, index) => ({
    _id: `demo_${platform}_${index + 1}`,
    platform,
    profileId: 'demo_profile',
    username: `theplus_${platform}`,
    displayName: `ThePlus ${platform[0]?.toUpperCase() ?? ''}${platform.slice(1)}`,
    isActive: true,
  }));
}

export function getDemoBrandDefaults(): WorkspaceBrandDefaultsRow {
  const now = new Date('2026-05-26T09:00:00.000Z').toISOString();
  return {
    workspace_id: DEMO_WORKSPACE_ID,
    brand_tone: 'luxe',
    brand_vibe: 'cinematic, confident, premium wellness, London creator culture',
    brand_palette: 'black, electric blue, white, chrome accents',
    default_cta: 'learn_more',
    created_at: now,
    updated_at: now,
  };
}

export function getDemoPostBrief(): PostBriefInput {
  return {
    modelId: DEMO_MODEL_ID,
    name: 'Citrus Fuel Launch',
    platforms: ['instagram', 'tiktok'],
    format: 'portrait',
    brief: 'Launch a premium citrus energy drink for creators who train before work.',
    scene: 'early-morning rooftop gym in East London',
    outfit: 'matte black activewear with a cropped technical jacket',
    props: 'sleek citrus drink can, gym towel, phone tripod',
    brandTone: 'luxe',
    brandVibe: 'premium, kinetic, creator-led',
    brandPalette: 'black, white, citrus green, electric blue',
    cta: 'learn_more',
    productRefUrls: [],
    postGoal: 'launch',
    lighting: 'golden_hour',
  };
}

export function getDemoPostVariants(brief: PostBriefInput = getDemoPostBrief()): PostVariant[] {
  const dims =
    brief.format === 'landscape'
      ? ['1200', '675']
      : brief.format === 'square'
        ? ['900', '900']
        : ['720', '1280'];
  return [1, 2].map((n) => ({
    url: `https://picsum.photos/seed/theplus-demo-${brief.format}-${n}/${dims[0]}/${dims[1]}`,
    generationId: `demo_variant_${n}`,
    generatedAt: new Date(2026, 4, 26, 10, n).toISOString(),
  }));
}

export function getDemoPosts(): PostRow[] {
  const brief = getDemoPostBrief();
  return [
    {
      id: DEMO_POST_ID,
      workspace_id: DEMO_WORKSPACE_ID,
      model_id: DEMO_MODEL_ID,
      name: brief.name,
      status: 'scheduled',
      platforms: brief.platforms,
      format: brief.format,
      prompt_inputs: brief,
      variants: getDemoPostVariants(brief),
      caption:
        'Morning momentum, bottled. Aria takes Citrus Fuel from rooftop warm-up to creator workday.',
      scheduled_for: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      zernio_post_id: 'demo_zernio_post',
      share_token: 'demo-review-link',
      review_status: 'approved',
      review_version: 2,
      approved_at: new Date('2026-05-25T12:00:00.000Z').toISOString(),
      finalized_at: null,
      created_at: new Date('2026-05-25T10:00:00.000Z').toISOString(),
      updated_at: new Date('2026-05-25T12:00:00.000Z').toISOString(),
    },
    {
      id: '00000000-0000-4000-8000-000000000202',
      workspace_id: DEMO_WORKSPACE_ID,
      model_id: DEMO_MODEL_ID,
      name: 'Creator Desk Reset',
      status: 'draft',
      platforms: ['instagram'],
      format: 'square',
      prompt_inputs: {
        ...brief,
        name: 'Creator Desk Reset',
        format: 'square',
        platforms: ['instagram'],
      },
      variants: getDemoPostVariants({ ...brief, name: 'Creator Desk Reset', format: 'square' }),
      caption: null,
      scheduled_for: null,
      zernio_post_id: null,
      share_token: null,
      review_status: 'needs_changes',
      review_version: 1,
      approved_at: null,
      finalized_at: null,
      created_at: new Date('2026-05-25T08:00:00.000Z').toISOString(),
      updated_at: new Date('2026-05-25T09:30:00.000Z').toISOString(),
    },
  ];
}

export function getDemoInfluencerVisuals(input: InfluencerWizardInput): InfluencerVisuals {
  return {
    portraitUrl: `https://i.pravatar.cc/900?u=${encodeURIComponent(input.name)}`,
    fullBodyUrl: `https://picsum.photos/seed/${encodeURIComponent(input.name)}-fullbody/720/1280`,
    generationIds: {
      portrait: `demo_${input.name.replace(/\W+/g, '_').toLowerCase()}_portrait`,
      fullBody: `demo_${input.name.replace(/\W+/g, '_').toLowerCase()}_fullbody`,
    },
  };
}

export function getDemoCaptions(brief: PostBriefInput): CaptionsResult {
  const hashtags = ['AICreator', 'CitrusFuel', 'CreatorRoutine', 'LondonFitness'];
  const candidates = [
    {
      id: 'a',
      angle: 'launch hook',
      caption: `${brief.name}: built for the morning block before the city wakes up. Clean citrus energy, cinematic pace, zero wasted motion.`,
      hashtags,
    },
    {
      id: 'b',
      angle: 'persona voice',
      caption:
        `Aria's rule: train first, create second, keep the ritual sharp. ${brief.cta === 'no_cta' ? '' : 'Tap in for the drop.'}`.trim(),
      hashtags,
    },
    {
      id: 'c',
      angle: 'community',
      caption:
        'For the creators turning early alarms into momentum. Citrus Fuel is the reset between reps, edits, and everything after.',
      hashtags,
    },
  ];
  return {
    candidates,
    perPlatform: getDemoPlatformVariants(brief, candidates[0].caption, hashtags),
  };
}

export function getDemoPlatformVariants(
  brief: PostBriefInput,
  caption: string,
  hashtags: string[],
): PlatformVariant[] {
  return brief.platforms.map((platform) => ({
    platform,
    caption:
      platform === 'tiktok'
        ? `POV: your morning routine finally matches your ambition. ${caption}`
        : caption,
    hashtags,
    hook: platform === 'tiktok' || platform === 'youtube' ? 'Morning routine reveal' : undefined,
  }));
}
