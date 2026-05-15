import { z } from 'zod';

export const REVIEW_DECISIONS = ['needs_changes', 'approved', 'final'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

const nullableEmail = z.preprocess((value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}, z.string().email().max(160).nullable());

export const ReviewDecisionFormSchema = z.object({
  decision: z.enum(REVIEW_DECISIONS),
  reviewerName: z.string().trim().min(1).max(120),
  reviewerEmail: nullableEmail,
  summary: z.string().trim().min(1).max(1200),
});

export type ReviewDecisionFormInput = z.infer<typeof ReviewDecisionFormSchema>;

export type ReviewDecisionFormResult =
  | { ok: true; data: ReviewDecisionFormInput }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

export function parseReviewDecisionFormData(formData: FormData): ReviewDecisionFormResult {
  const parsed = ReviewDecisionFormSchema.safeParse({
    decision: formData.get('decision'),
    reviewerName: formData.get('reviewerName'),
    reviewerEmail: formData.get('reviewerEmail'),
    summary: formData.get('summary'),
  });

  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return {
    ok: false,
    error: 'Please fix the highlighted approval fields.',
    fieldErrors,
  };
}

export function formatReviewDecision(decision: ReviewDecision): string {
  if (decision === 'needs_changes') return 'Needs changes';
  if (decision === 'approved') return 'Approved';
  return 'Final';
}

export function isApprovedReviewStatus(decision: ReviewDecision): boolean {
  return decision === 'approved' || decision === 'final';
}
