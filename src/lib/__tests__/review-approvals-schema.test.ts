import { describe, expect, it } from 'vitest';
import {
  formatReviewDecision,
  isApprovedReviewStatus,
  parseReviewDecisionFormData,
} from '@/lib/review-approvals-schema';

describe('parseReviewDecisionFormData', () => {
  it('normalizes valid decision form input', () => {
    const form = new FormData();
    form.set('decision', 'approved');
    form.set('reviewerName', '  Ada  ');
    form.set('reviewerEmail', '');
    form.set('summary', '  Approved for launch.  ');

    const parsed = parseReviewDecisionFormData(form);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data).toEqual({
        decision: 'approved',
        reviewerName: 'Ada',
        reviewerEmail: null,
        summary: 'Approved for launch.',
      });
    }
  });

  it('rejects missing reviewer and empty summaries', () => {
    const form = new FormData();
    form.set('decision', 'approved');
    form.set('reviewerName', '');
    form.set('summary', ' ');

    const parsed = parseReviewDecisionFormData(form);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.fieldErrors.reviewerName).toBeTruthy();
      expect(parsed.fieldErrors.summary).toBeTruthy();
    }
  });
});

describe('review decision helpers', () => {
  it('formats labels and approval state', () => {
    expect(formatReviewDecision('needs_changes')).toBe('Needs changes');
    expect(formatReviewDecision('approved')).toBe('Approved');
    expect(formatReviewDecision('final')).toBe('Final');
    expect(isApprovedReviewStatus('needs_changes')).toBe(false);
    expect(isApprovedReviewStatus('approved')).toBe(true);
    expect(isApprovedReviewStatus('final')).toBe(true);
  });
});
