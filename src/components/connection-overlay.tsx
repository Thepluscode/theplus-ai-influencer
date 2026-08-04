'use client';

import { useEffect, useId, useRef, useState } from 'react';

interface ConnectionOverlayProps {
  className: string;
  targetSelector: string;
  colours: string[];
  sourceX: number;
  sourceY: number;
  sourceSpread?: number;
  targetAnchorX?: number;
  targetAnchorY?: number;
  initialGeometry?: Geometry;
}

interface Geometry {
  width: number;
  height: number;
  targets: Array<{ x: number; y: number }>;
}

export function ConnectionOverlay({
  className,
  targetSelector,
  colours,
  sourceX,
  sourceY,
  sourceSpread = 0,
  targetAnchorX = 0.5,
  targetAnchorY = 0.5,
  initialGeometry,
}: ConnectionOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const filterId = `connection-glow-${useId().replaceAll(':', '')}`;
  const [geometry, setGeometry] = useState<Geometry>(
    initialGeometry ?? { width: 1, height: 1, targets: [] },
  );

  useEffect(() => {
    const svg = svgRef.current;
    const container = svg?.parentElement;
    if (!svg || !container) return;

    const measure = () => {
      const containerRect = container.getBoundingClientRect();
      const targets = Array.from(container.querySelectorAll<HTMLElement>(targetSelector)).map(
        (target) => {
          const rect = target.getBoundingClientRect();
          return {
            x: rect.left - containerRect.left + rect.width * targetAnchorX,
            y: rect.top - containerRect.top + rect.height * targetAnchorY,
          };
        },
      );

      setGeometry({ width: containerRect.width, height: containerRect.height, targets });
    };

    const frame = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    container.querySelectorAll<HTMLElement>(targetSelector).forEach((target) => {
      observer.observe(target);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [targetAnchorX, targetAnchorY, targetSelector]);

  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {geometry.targets.map((target, index) => {
        const startX = geometry.width * sourceX;
        const startY =
          geometry.height * sourceY + (index - (geometry.targets.length - 1) / 2) * sourceSpread;
        const deltaX = target.x - startX;
        const path = `M ${startX} ${startY} C ${startX + deltaX * 0.34} ${startY}, ${target.x - deltaX * 0.24} ${target.y}, ${target.x} ${target.y}`;
        const colour = colours[index % colours.length];

        return (
          <g key={index} style={{ color: colour }}>
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
              opacity="0.16"
              filter={`url(#${filterId})`}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.94"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={target.x} cy={target.y} r="2.5" fill="currentColor" />
          </g>
        );
      })}
    </svg>
  );
}
