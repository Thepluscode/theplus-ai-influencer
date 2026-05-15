import { z } from 'zod';

export const REVIEW_STATUSES = ['open', 'resolved'] as const;
export const REVIEW_SUBJECT_TYPES = ['post', 'storyboard'] as const;

export type ReviewCommentStatus = (typeof REVIEW_STATUSES)[number];
export type ReviewSubjectType = (typeof REVIEW_SUBJECT_TYPES)[number];

const nullableIndex = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') return null;
  return value;
}, z.coerce.number().int().min(0).max(999).nullable());

const nullableEmail = z.preprocess((value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}, z.string().email().max(160).nullable());

const anchorCoordinate = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') return 50;
  return value;
}, z.coerce.number().min(0).max(100).transform(roundCoordinate));

export const ReviewCommentFormSchema = z.object({
  authorName: z.string().trim().min(1).max(120),
  authorEmail: nullableEmail,
  body: z.string().trim().min(1).max(1200),
  shotIndex: nullableIndex,
  variantIndex: nullableIndex,
  timeMs: z.preprocess(
    (value) => {
      if (value === null || value === undefined || value === '') return 0;
      return value;
    },
    z.coerce
      .number()
      .int()
      .min(0)
      .max(60 * 60 * 1000),
  ),
  anchorX: anchorCoordinate,
  anchorY: anchorCoordinate,
});

export type ReviewCommentFormInput = z.infer<typeof ReviewCommentFormSchema>;

export type ReviewCommentFormResult =
  | { ok: true; data: ReviewCommentFormInput }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

export function parseReviewCommentFormData(formData: FormData): ReviewCommentFormResult {
  const parsed = ReviewCommentFormSchema.safeParse({
    authorName: formData.get('authorName'),
    authorEmail: formData.get('authorEmail'),
    body: formData.get('body'),
    shotIndex: formData.get('shotIndex'),
    variantIndex: formData.get('variantIndex'),
    timeMs: formData.get('timeMs'),
    anchorX: formData.get('anchorX'),
    anchorY: formData.get('anchorY'),
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
    error: 'Please fix the highlighted review fields.',
    fieldErrors,
  };
}

export function formatReviewTimecode(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => part.toString().padStart(2, '0')).join(':');
}

export function clampReviewCoordinate(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return roundCoordinate(Math.min(100, Math.max(0, value)));
}

function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}
