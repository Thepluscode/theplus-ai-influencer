import Image from 'next/image';
import { cn } from '@/lib/utils';

export function ThePlusTechMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 overflow-hidden rounded-full bg-[#101014] ring-1 ring-white/10',
        className,
      )}
    >
      <Image
        src="/brand/theplus-tech-mark.jpg"
        alt="ThePlus-tech"
        fill
        sizes="40px"
        className="object-cover"
      />
    </span>
  );
}

export function ThePlusTechBrand({
  className,
  markClassName,
  sublabel,
}: {
  className?: string;
  markClassName?: string;
  sublabel?: string;
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <ThePlusTechMark className={cn('h-8 w-8', markClassName)} />
      <span className="min-w-0">
        <span className="block truncate leading-tight">ThePlus-tech</span>
        {sublabel ? (
          <span className="block truncate text-[11px] font-normal uppercase tracking-[0.18em] text-[#666]">
            {sublabel}
          </span>
        ) : null}
      </span>
    </span>
  );
}
