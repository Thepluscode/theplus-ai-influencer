'use client';

import { useEffect } from 'react';

export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.landing-page');
    if (!root) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealItems = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));

    if (reducedMotion) {
      revealItems.forEach((item) => item.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
    );

    revealItems.forEach((item) => observer.observe(item));

    const updatePointer = (event: PointerEvent) => {
      root.style.setProperty('--pointer-x', `${event.clientX}px`);
      root.style.setProperty('--pointer-y', `${event.clientY}px`);
      root.style.setProperty(
        '--hero-rotate-x',
        `${(event.clientY / window.innerHeight - 0.5) * -4}deg`,
      );
      root.style.setProperty(
        '--hero-rotate-y',
        `${(event.clientX / window.innerWidth - 0.5) * 6}deg`,
      );
    };

    window.addEventListener('pointermove', updatePointer, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('pointermove', updatePointer);
    };
  }, []);

  return null;
}
