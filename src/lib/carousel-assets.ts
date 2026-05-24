import type { CarouselSlide, PlanItem } from '@/lib/series-planner';
import { PostBriefInput, type PostBriefInput as PostBrief, type PostVariant } from '@/types/post';

export type CarouselAssetMode = 'missing' | 'regenerate';

export type CarouselAssetResult =
  | {
      status: 'ready';
      slideIndex: number;
      url: string;
      generationId: string;
      generatedAt: string;
    }
  | {
      status: 'failed';
      slideIndex: number;
      error: string;
      attemptedAt: string;
    };

export function getCarouselAssetTargets(
  slides: CarouselSlide[],
  mode: CarouselAssetMode,
): number[] {
  return slides.flatMap((slide, index) => {
    if (mode === 'regenerate') return [index];
    return slide.asset?.status === 'ready' ? [] : [index];
  });
}

export function buildCarouselAssetBrief(input: {
  modelId: string;
  item: PlanItem;
  slide: CarouselSlide;
  slideIndex: number;
}): PostBrief {
  const { item, modelId, slide, slideIndex } = input;
  return PostBriefInput.parse({
    modelId,
    name: truncate(`${item.theme} · carousel ${slideIndex + 1}`, 120),
    platforms: item.platforms,
    format: item.format,
    brief: truncate(
      [
        item.brief,
        `Carousel slide ${slideIndex + 1}: ${slide.title}.`,
        slide.copy ? `Slide copy direction: ${slide.copy}.` : '',
        `Generate a clean visual asset for the designer to overlay text later. ${slide.visualBrief}`,
      ]
        .filter(Boolean)
        .join('\n'),
      800,
    ),
    scene: truncate(slide.visualBrief || item.scene, 200),
    outfit: truncate(item.outfit, 200),
    props: truncate(item.props, 200),
    brandTone: item.brandTone,
    brandVibe: undefined,
    brandPalette: undefined,
    cta: item.cta,
    uploadedImageUrl: undefined,
    productRefUrls: [],
    postGoal: item.postGoal,
    lighting: item.lighting,
  });
}

export function mergeCarouselAssetResults(
  items: PlanItem[],
  itemIndex: number,
  results: CarouselAssetResult[],
): PlanItem[] {
  const resultBySlide = new Map(results.map((result) => [result.slideIndex, result]));
  return items.map((item, index) => {
    if (index !== itemIndex) return item;
    return {
      ...item,
      contentPackage: {
        ...item.contentPackage,
        carouselSlides: item.contentPackage.carouselSlides.map((slide, slideIndex) => {
          const result = resultBySlide.get(slideIndex);
          if (!result) return slide;
          if (result.status === 'ready') {
            return {
              ...slide,
              asset: {
                status: 'ready' as const,
                url: result.url,
                generationId: result.generationId,
                generatedAt: result.generatedAt,
              },
            };
          }
          if (slide.asset?.status === 'ready') {
            return {
              ...slide,
              asset: {
                ...slide.asset,
                lastError: result.error,
                lastAttemptedAt: result.attemptedAt,
              },
            };
          }
          return {
            ...slide,
            asset: {
              status: 'failed' as const,
              error: result.error,
              generatedAt: result.attemptedAt,
            },
          };
        }),
      },
    };
  });
}

export function getReadyCarouselVariants(slides: CarouselSlide[]): PostVariant[] {
  return slides.flatMap((slide) => {
    const asset = slide.asset;
    if (asset?.status !== 'ready' || !asset.url || !asset.generationId) return [];
    return [
      {
        url: asset.url,
        generationId: asset.generationId,
        generatedAt: asset.generatedAt ?? new Date().toISOString(),
      },
    ];
  });
}

export function buildCarouselCalendarDraft(input: { modelId: string; item: PlanItem }): {
  brief: PostBrief;
  caption: string;
} {
  const { item, modelId } = input;
  const slides = item.contentPackage.carouselSlides;
  const slideDirections = slides
    .map((slide, index) => `Slide ${index + 1}: ${slide.title} — ${slide.copy}`)
    .join('\n');
  const brief = PostBriefInput.parse({
    modelId,
    name: truncate(`${item.theme} · carousel draft`, 120),
    platforms: item.platforms,
    format: item.format,
    brief: truncate([item.brief, slideDirections].filter(Boolean).join('\n\n'), 800),
    scene: truncate(item.scene, 200),
    outfit: truncate(item.outfit, 200),
    props: truncate(item.props, 200),
    brandTone: item.brandTone,
    brandVibe: undefined,
    brandPalette: undefined,
    cta: item.cta,
    uploadedImageUrl: undefined,
    productRefUrls: [],
    postGoal: item.postGoal,
    lighting: item.lighting,
  });
  return {
    brief,
    caption: item.contentPackage.linkedinPost.trim() || item.hook.trim() || item.brief.trim(),
  };
}

export function mergeCarouselDraftPost(
  items: PlanItem[],
  itemIndex: number,
  draft: { postId: string; createdAt: string },
): PlanItem[] {
  return items.map((item, index) => {
    if (index !== itemIndex) return item;
    return {
      ...item,
      contentPackage: {
        ...item.contentPackage,
        calendarDraft: draft,
      },
    };
  });
}

export function mergeCarouselScheduledPost(
  items: PlanItem[],
  itemIndex: number,
  scheduled: { postId: string; scheduledFor: string; pushedToZernio: boolean; updatedAt: string },
): PlanItem[] {
  return items.map((item, index) => {
    if (index !== itemIndex) return item;
    return {
      ...item,
      contentPackage: {
        ...item.contentPackage,
        calendarDraft: item.contentPackage.calendarDraft ?? {
          postId: scheduled.postId,
          createdAt: scheduled.updatedAt,
        },
        scheduledPost: scheduled,
      },
    };
  });
}

export function mergeCarouselReviewLink(
  items: PlanItem[],
  itemIndex: number,
  review: { postId: string; token: string; enabledAt: string },
): PlanItem[] {
  return items.map((item, index) => {
    if (index !== itemIndex) return item;
    return {
      ...item,
      contentPackage: {
        ...item.contentPackage,
        calendarDraft: item.contentPackage.calendarDraft ?? {
          postId: review.postId,
          createdAt: review.enabledAt,
        },
        reviewLink: review,
      },
    };
  });
}

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max - 1).trimEnd();
}
