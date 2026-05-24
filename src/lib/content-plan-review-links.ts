import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { ContentPlanRow } from '@/lib/supabase/types';
import type { ContentPackage, PlanItem } from '@/lib/series-planner';

export type ReviewLinkLookup = Map<string, string>;

export async function getPostReviewLinksForPlans(
  workspaceId: string,
  plans: ContentPlanRow[],
): Promise<ReviewLinkLookup> {
  return getPostReviewLinksForItems(
    workspaceId,
    plans.flatMap((plan) => getPlanItems(plan)),
  );
}

export async function getPostReviewLinksForItems(
  workspaceId: string,
  items: PlanItem[],
): Promise<ReviewLinkLookup> {
  const postIds = Array.from(
    new Set(items.flatMap((item) => getPackagePostIds(item.contentPackage))),
  );
  if (postIds.length === 0) return new Map();

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('posts')
    .select('id, share_token')
    .eq('workspace_id', workspaceId)
    .in('id', postIds);
  if (error) {
    throw new Error(`Failed to load review links: ${error.message}`);
  }

  return new Map(
    (data ?? []).flatMap((post) =>
      post.share_token ? ([[post.id, post.share_token]] as const) : [],
    ),
  );
}

export function getPlanReviewSummary(
  plan: ContentPlanRow,
  postReviewLinks: ReviewLinkLookup,
): { count: number; firstHref: string | null } {
  const links = new Set<string>();

  for (const item of getPlanItems(plan)) {
    const href = getItemReviewHref(item, postReviewLinks);
    if (href) links.add(href);
  }

  const orderedLinks = Array.from(links);
  return {
    count: orderedLinks.length,
    firstHref: orderedLinks[0] ?? null,
  };
}

export function getItemReviewHref(
  item: PlanItem,
  postReviewLinks: ReviewLinkLookup,
): string | null {
  const packageToken = item.contentPackage.reviewLink?.token;
  if (packageToken) return `/p/${packageToken}`;

  for (const postId of getPackagePostIds(item.contentPackage)) {
    const token = postReviewLinks.get(postId);
    if (token) return `/p/${token}`;
  }
  return null;
}

export function getPlanItems(plan: ContentPlanRow): PlanItem[] {
  return (Array.isArray(plan.items) ? plan.items : []) as PlanItem[];
}

function getPackagePostIds(pkg: ContentPackage): string[] {
  return [pkg.reviewLink?.postId, pkg.scheduledPost?.postId, pkg.calendarDraft?.postId].filter(
    (postId): postId is string => Boolean(postId),
  );
}
