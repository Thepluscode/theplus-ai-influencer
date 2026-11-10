import { describe, expect, it } from 'vitest';
import { EDGE, placeCard, TOUR_STEPS } from '../tour';

const viewport = { width: 1440, height: 900 };
const card = { width: 340, height: 220 };

describe('placeCard', () => {
  it('puts the card to the right of a sidebar item', () => {
    const p = placeCard({ top: 200, left: 12, width: 220, height: 44 }, viewport, card);
    expect(p.anchored).toBe(true);
    expect(p.left).toBeGreaterThan(12 + 220);
  });

  it('falls back to below when there is no room on the right', () => {
    const p = placeCard({ top: 20, left: 1300, width: 120, height: 40 }, viewport, card);
    expect(p).toMatchObject({ anchored: true, top: 20 + 40 + 14 });
    expect(p.left + card.width).toBeLessThanOrEqual(viewport.width - EDGE);
  });

  it('centres when the target is missing or hidden', () => {
    expect(placeCard(null, viewport, card)).toEqual({ top: 340, left: 550, anchored: false });
    expect(placeCard({ top: 0, left: 0, width: 0, height: 0 }, viewport, card).anchored).toBe(
      false,
    );
  });

  it('never places the card off a phone screen', () => {
    const phone = { width: 390, height: 844 };
    const small = { width: 358, height: 240 };
    for (const t of [
      null,
      { top: 100, left: 8, width: 60, height: 44 },
      { top: 800, left: 300, width: 60, height: 30 },
    ]) {
      const p = placeCard(t, phone, small);
      expect(p.left).toBeGreaterThanOrEqual(EDGE);
      expect(p.left + small.width).toBeLessThanOrEqual(phone.width - EDGE);
      expect(p.top).toBeGreaterThanOrEqual(EDGE);
      expect(p.top + small.height).toBeLessThanOrEqual(phone.height - EDGE);
    }
  });
});

describe('TOUR_STEPS', () => {
  it('has unique ids and starts and ends without a target', () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
    expect(TOUR_STEPS[0].target).toBeUndefined();
    expect(TOUR_STEPS.at(-1)?.target).toBeUndefined();
  });
});
