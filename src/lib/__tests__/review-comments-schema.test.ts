import { describe, expect, it } from 'vitest';
import {
  clampReviewCoordinate,
  formatReviewTimecode,
  parseReviewCommentFormData,
} from '@/lib/review-comments-schema';

describe('formatReviewTimecode', () => {
  it('formats millisecond offsets as HH:MM:SS', () => {
    expect(formatReviewTimecode(0)).toBe('00:00:00');
    expect(formatReviewTimecode(2_500)).toBe('00:00:02');
    expect(formatReviewTimecode(65_000)).toBe('00:01:05');
    expect(formatReviewTimecode(3_661_000)).toBe('01:01:01');
  });

  it('clamps negative offsets to zero', () => {
    expect(formatReviewTimecode(-200)).toBe('00:00:00');
  });
});

describe('clampReviewCoordinate', () => {
  it('bounds marker coordinates to the asset plane', () => {
    expect(clampReviewCoordinate(-5)).toBe(0);
    expect(clampReviewCoordinate(42.126)).toBe(42.13);
    expect(clampReviewCoordinate(150)).toBe(100);
    expect(clampReviewCoordinate(Number.NaN)).toBe(50);
  });
});

describe('parseReviewCommentFormData', () => {
  it('normalizes valid form input', () => {
    const form = new FormData();
    form.set('authorName', '  Ada  ');
    form.set('authorEmail', '');
    form.set('body', '  Check the CTA beat.  ');
    form.set('shotIndex', '2');
    form.set('variantIndex', '');
    form.set('timeMs', '4500');
    form.set('anchorX', '21.456');
    form.set('anchorY', '72.333');

    const parsed = parseReviewCommentFormData(form);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data).toMatchObject({
        authorName: 'Ada',
        authorEmail: null,
        body: 'Check the CTA beat.',
        shotIndex: 2,
        variantIndex: null,
        timeMs: 4500,
        anchorX: 21.46,
        anchorY: 72.33,
      });
    }
  });

  it('rejects empty bodies and out-of-bounds anchors', () => {
    const form = new FormData();
    form.set('authorName', 'Ada');
    form.set('body', ' ');
    form.set('anchorX', '101');
    form.set('anchorY', '50');

    const parsed = parseReviewCommentFormData(form);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.fieldErrors.body).toBeTruthy();
      expect(parsed.fieldErrors.anchorX).toBeTruthy();
    }
  });
});
