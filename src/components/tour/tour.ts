// Guided tour: steps and card placement. Pure, so placement is unit-tested.
// A step's `target` matches an element's data-tour attribute; a step whose
// target is missing or hidden (e.g. a collapsed nav on mobile) is shown centred
// instead of pointing at nothing.

export interface TourStep {
  id: string;
  target?: string;
  section: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    section: 'Welcome',
    title: 'A one-minute tour',
    body: 'Where your personas live, how to make pictures with them, and how a post gets from draft to scheduled. Use the arrow keys or Next and Back; Escape ends it.',
  },
  {
    id: 'studio',
    target: 'studio',
    section: 'Studio',
    title: 'Your personas live here',
    body: 'A persona is a reusable face and identity. Build her once; every later picture locks to that face.',
  },
  {
    id: 'generate',
    target: 'create',
    section: 'Generate',
    title: 'Make pictures with @handle',
    body: 'Describe a scene and type @ plus her handle to lock her face. Edit any result. The cost is on the Generate button before you spend anything.',
  },
  {
    id: 'post',
    target: 'create-post',
    section: 'Create',
    title: 'Turn a picture into a post',
    body: 'Captions, platform formats and the brand-safety check all happen here, before anything can be scheduled.',
  },
  {
    id: 'campaigns',
    target: 'series',
    section: 'Campaigns',
    title: 'Plan a rhythm',
    body: 'Set a cadence and platforms and get a dated plan of posts to fill.',
  },
  {
    id: 'calendar',
    target: 'calendar',
    section: 'Calendar',
    title: 'See what is going out',
    body: 'Scheduled and draft posts by day.',
  },
  {
    id: 'credits',
    target: 'credits',
    section: 'Credits',
    title: 'Your balance',
    body: 'Renders spend credits; captions and planning spend a few. A failed render is refunded automatically.',
  },
  {
    id: 'done',
    section: 'Done',
    title: 'That is the studio',
    body: 'Start in Studio by building your first persona. You can rerun this tour from /welcome.',
  },
];

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const CARD_GAP = 14;
export const EDGE = 16;

/**
 * Where the card goes: to the right of the target, else below, else above,
 * else centred, always clamped inside the viewport.
 */
export function placeCard(
  target: Rect | null,
  viewport: { width: number; height: number },
  card: { width: number; height: number },
): { top: number; left: number; anchored: boolean } {
  const clampX = (x: number) => Math.min(Math.max(EDGE, x), viewport.width - card.width - EDGE);
  const clampY = (y: number) => Math.min(Math.max(EDGE, y), viewport.height - card.height - EDGE);
  const centred = {
    top: clampY((viewport.height - card.height) / 2),
    left: clampX((viewport.width - card.width) / 2),
    anchored: false,
  };
  if (!target || target.width <= 0 || target.height <= 0) return centred;

  const right = target.left + target.width + CARD_GAP;
  if (right + card.width + EDGE <= viewport.width) {
    return {
      top: clampY(target.top + target.height / 2 - card.height / 2),
      left: right,
      anchored: true,
    };
  }
  const below = target.top + target.height + CARD_GAP;
  if (below + card.height + EDGE <= viewport.height) {
    return {
      top: below,
      left: clampX(target.left + target.width / 2 - card.width / 2),
      anchored: true,
    };
  }
  const above = target.top - CARD_GAP - card.height;
  if (above >= EDGE) {
    return {
      top: above,
      left: clampX(target.left + target.width / 2 - card.width / 2),
      anchored: true,
    };
  }
  return centred;
}
