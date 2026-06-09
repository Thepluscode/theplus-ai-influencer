import 'server-only';
import { serverEnv } from '@/lib/env';
import type {
  AiModelRow,
  CommentRow,
  ContentPlanRow,
  DmThreadRow,
  PostRow,
  StoryboardRow,
  WorkspaceBrandDefaultsRow,
  WorkspaceInviteRow,
  WorkspaceRow,
  WorkspaceWebhookRow,
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

export function getDemoContentPlans(): ContentPlanRow[] {
  const start = new Date('2026-05-27T09:00:00.000Z').toISOString();
  const created = new Date('2026-05-25T11:00:00.000Z').toISOString();
  return [
    {
      id: '00000000-0000-4000-8000-000000000301',
      workspace_id: DEMO_WORKSPACE_ID,
      model_id: DEMO_MODEL_ID,
      name: 'Citrus Fuel Launch Arc',
      goal: 'launch',
      duration_days: 14,
      cadence_per_week: 4,
      start_date: start,
      seed_inputs: {
        campaign: 'Launch Citrus Fuel to creator-athletes',
        platforms: ['instagram', 'tiktok', 'linkedin'],
        topics: 'morning routines, focus blocks, rooftop training, creator discipline',
        audience: 'health-conscious creators and founders',
        brandEntity: 'company',
        deliverables: ['short_video', 'carousel', 'linkedin_post', 'blog'],
        contentStyles: ['cinematic', 'educational', 'direct_response'],
        visualMode: 'face_carousel',
        summary: 'A two-week launch sequence moving from ritual to proof to conversion.',
      },
      items: [
        demoPlanItem(0, 'Rooftop ritual', 'portrait', ['instagram', 'tiktok']),
        demoPlanItem(3, 'Desk reset proof', 'square', ['instagram', 'linkedin']),
        demoPlanItem(7, 'Founder focus block', 'landscape', ['youtube', 'linkedin']),
        demoPlanItem(11, 'Community routine recap', 'portrait', ['instagram', 'tiktok']),
      ],
      created_at: created,
      updated_at: new Date('2026-05-25T12:30:00.000Z').toISOString(),
    },
  ];
}

export function getDemoStoryboards(): StoryboardRow[] {
  const shots = [0, 1, 2, 3].map((index) => ({
    index,
    prompt: [
      'Low-angle rooftop gym setup with city sunrise and chilled citrus can in foreground.',
      'Close product pickup as Aria locks phone to tripod and starts the timer.',
      'Fast mid-shot transitions between reps, edits, and calendar blocks.',
      'Hero handoff to camera with skyline behind and product label readable.',
    ][index],
    hookCaption: [
      'Before inbox. Before calls.',
      'Fuel the ritual.',
      'Train. Edit. Ship.',
      'Own the morning.',
    ][index],
    durationMs: 2500,
    imageUrl: `https://picsum.photos/seed/theplus-storyboard-${index}/720/1280`,
    generationId: `demo_storyboard_shot_${index}`,
    generatedAt: new Date('2026-05-25T13:0' + index + ':00.000Z').toISOString(),
  }));
  return [
    {
      id: '00000000-0000-4000-8000-000000000401',
      workspace_id: DEMO_WORKSPACE_ID,
      model_id: DEMO_MODEL_ID,
      name: 'Morning Momentum Reel',
      brief: 'Show Aria turning an early workout into a focused creator workday for Citrus Fuel.',
      format: 'portrait',
      summary: 'A four-shot reel that turns the product into the first action of the day.',
      shots,
      review_status: 'approved',
      review_version: 2,
      approved_at: new Date('2026-05-25T15:00:00.000Z').toISOString(),
      finalized_at: null,
      created_at: new Date('2026-05-25T13:00:00.000Z').toISOString(),
      updated_at: new Date('2026-05-25T15:00:00.000Z').toISOString(),
    },
  ];
}

export function getDemoComments(): CommentRow[] {
  const now = new Date('2026-05-26T09:00:00.000Z').toISOString();
  return [
    {
      id: '00000000-0000-4000-8000-000000000501',
      workspace_id: DEMO_WORKSPACE_ID,
      post_id: DEMO_POST_ID,
      platform: 'instagram',
      author_handle: 'mira.moves',
      author_avatar: null,
      comment_text: 'Where can I buy the citrus can from the reel?',
      status: 'pending',
      draft_reply:
        'Link is in bio now — the launch bundle is the one Aria used in the rooftop reel.',
      classification: 'question',
      external_id: 'demo_comment_1',
      zernio_post_id: null,
      zernio_account_id: null,
      created_at: now,
      updated_at: now,
    },
    {
      id: '00000000-0000-4000-8000-000000000502',
      workspace_id: DEMO_WORKSPACE_ID,
      post_id: DEMO_POST_ID,
      platform: 'tiktok',
      author_handle: 'branddesk.co',
      author_avatar: null,
      comment_text: 'Love this look. Open to a paid collab next month?',
      status: 'pending',
      draft_reply: 'Appreciate it — DM the brief and timeline and the team will review properly.',
      classification: 'collab',
      external_id: 'demo_comment_2',
      zernio_post_id: null,
      zernio_account_id: null,
      created_at: new Date('2026-05-26T08:20:00.000Z').toISOString(),
      updated_at: new Date('2026-05-26T08:20:00.000Z').toISOString(),
    },
    {
      id: '00000000-0000-4000-8000-000000000503',
      workspace_id: DEMO_WORKSPACE_ID,
      post_id: DEMO_POST_ID,
      platform: 'instagram',
      author_handle: 'dailyfitnotes',
      author_avatar: null,
      comment_text: 'This routine is clean. Saved it for tomorrow.',
      status: 'replied',
      draft_reply: 'That is the move — make the morning easy to repeat.',
      classification: 'fan',
      external_id: 'demo_comment_3',
      zernio_post_id: null,
      zernio_account_id: null,
      created_at: new Date('2026-05-25T18:00:00.000Z').toISOString(),
      updated_at: new Date('2026-05-25T18:30:00.000Z').toISOString(),
    },
  ];
}

export function getDemoDmThreads(): DmThreadRow[] {
  return [
    {
      id: '00000000-0000-4000-8000-000000000601',
      workspace_id: DEMO_WORKSPACE_ID,
      platform: 'instagram',
      author_handle: 'atlas_agency',
      author_avatar: null,
      last_message: 'We represent a gym wear label. Can Aria shoot a paid launch post in June?',
      classification: 'collab',
      summary: 'Agency proposing a paid gym wear launch collaboration.',
      suggested_reply:
        'Thanks for reaching out — send the brief, deliverables, and timeline to partnerships@theplus.ai and we will review.',
      status: 'pending',
      external_id: 'demo_dm_1',
      zernio_conversation_id: null,
      zernio_account_id: null,
      created_at: new Date('2026-05-26T08:10:00.000Z').toISOString(),
      updated_at: new Date('2026-05-26T08:10:00.000Z').toISOString(),
    },
    {
      id: '00000000-0000-4000-8000-000000000602',
      workspace_id: DEMO_WORKSPACE_ID,
      platform: 'tiktok',
      author_handle: 'founderfuel',
      author_avatar: null,
      last_message: 'Is the citrus drink vegan and caffeine free?',
      classification: 'lead',
      summary: 'Potential customer asking product fit questions.',
      suggested_reply:
        'It is vegan; it does include caffeine, so check the label if you are limiting stimulants.',
      status: 'pending',
      external_id: 'demo_dm_2',
      zernio_conversation_id: null,
      zernio_account_id: null,
      created_at: new Date('2026-05-26T07:40:00.000Z').toISOString(),
      updated_at: new Date('2026-05-26T07:40:00.000Z').toISOString(),
    },
    {
      id: '00000000-0000-4000-8000-000000000603',
      workspace_id: DEMO_WORKSPACE_ID,
      platform: 'instagram',
      author_handle: 'runclubnorth',
      author_avatar: null,
      last_message: 'Thanks for the answer yesterday. We ordered the sample pack.',
      classification: 'fan',
      summary: 'Fan follow-up after ordering.',
      suggested_reply: 'Love that — let me know which flavour wins after the first session.',
      status: 'replied',
      external_id: 'demo_dm_3',
      zernio_conversation_id: null,
      zernio_account_id: null,
      created_at: new Date('2026-05-25T16:00:00.000Z').toISOString(),
      updated_at: new Date('2026-05-25T17:00:00.000Z').toISOString(),
    },
  ];
}

export function getDemoInvites(): WorkspaceInviteRow[] {
  return [
    {
      id: '00000000-0000-4000-8000-000000000701',
      workspace_id: DEMO_WORKSPACE_ID,
      email: 'producer@theplus.ai',
      role: 'editor',
      status: 'pending',
      invited_by_user_id: '00000000-0000-4000-8000-000000000011',
      created_at: new Date('2026-05-25T10:00:00.000Z').toISOString(),
      updated_at: new Date('2026-05-25T10:00:00.000Z').toISOString(),
    },
  ];
}

export function getDemoWebhooks(): WorkspaceWebhookRow[] {
  return [
    {
      id: '00000000-0000-4000-8000-000000000801',
      workspace_id: DEMO_WORKSPACE_ID,
      name: 'Ops listener',
      url: 'https://demo.theplus.ai/webhooks/social-ops',
      events: ['post.scheduled', 'review.approved', 'comment.created'],
      active: true,
      last_delivery_at: new Date('2026-05-25T12:00:00.000Z').toISOString(),
      last_delivery_status: 200,
      created_at: new Date('2026-05-24T12:00:00.000Z').toISOString(),
      updated_at: new Date('2026-05-25T12:00:00.000Z').toISOString(),
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

function demoPlanItem(
  day: number,
  theme: string,
  format: 'square' | 'portrait' | 'landscape',
  platforms: Platform[],
) {
  return {
    day,
    scheduledAt: new Date(Date.UTC(2026, 4, 27 + day, 9, 0, 0)).toISOString(),
    theme,
    brief: `${theme} for Citrus Fuel, showing Aria turning product use into a creator routine.`,
    scene: 'premium London fitness and creator workspace setting',
    outfit: 'black technical activewear with chrome accessories',
    props: 'citrus drink can, tripod, laptop, training towel',
    hook: 'The morning move that protects the whole day.',
    postGoal: 'launch',
    lighting: 'golden_hour',
    platforms,
    format,
    brandTone: 'luxe',
    cta: 'learn_more',
    contentPackage: {
      deliverables: ['short_video', 'carousel', 'linkedin_post', 'blog'],
      style: 'cinematic',
      visualMode: 'face_carousel',
      carouselSlides: [
        {
          title: 'Hook the ritual',
          copy: 'Before inbox. Before calls. Protect the first block.',
          visualBrief: 'Aria on a London rooftop with product foreground.',
          facePlacement: 'hero',
        },
        {
          title: 'Show the product',
          copy: 'Citrus Fuel sits inside the routine, not on top of it.',
          visualBrief: 'Close product detail beside phone timer and towel.',
          facePlacement: 'supporting',
        },
      ],
      filmingScript: {
        hook: 'The morning move that protects the whole day.',
        beats: ['Open on product', 'Cut to training', 'Cut to creator desk', 'Land the CTA'],
        broll: ['citrus can close-up', 'phone tripod setup', 'calendar focus block'],
        cta: 'Learn more from the launch page.',
      },
      linkedinPost: 'A concise founder-style post about building repeatable morning rituals.',
      email: {
        subject: 'Fuel the first block',
        preview: 'The creator routine behind the Citrus Fuel launch.',
        body: 'Launch announcement, morning ritual framing, and a clear CTA.',
      },
      blog: {
        title: 'How creators build repeatable morning routines',
        slug: 'creator-morning-routines',
        metaDescription: 'A practical guide to creator routines, focus blocks, and energy rituals.',
        outline: ['Why morning friction matters', 'The repeatable ritual', 'How Citrus Fuel fits'],
        aeoQuestions: ['What is a creator morning routine?', 'How do creators stay consistent?'],
        conversionCta: 'Try the Citrus Fuel launch bundle.',
      },
      seoKeywords: ['creator morning routine', 'energy drink launch', 'fitness content ritual'],
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
