import Link from 'next/link';
import { Zap } from 'lucide-react';

export function InsufficientCreditsBanner({
  balance,
  required,
}: {
  balance: number;
  required: number;
}) {
  const short = required - balance;
  return (
    <div className="rounded-[12px] border border-[#ff7a3d]/40 bg-[#ff7a3d]/[0.07] p-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ff7a3d]/15 text-[#ff7a3d] ring-1 ring-[#ff7a3d]/30">
          <Zap size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-ink">
            Not enough credits to run this.
          </p>
          <p className="mt-0.5 text-[13px] leading-[1.4] text-ink-muted">
            You have <span className="tabular-nums text-ink">{balance.toLocaleString()}</span>{' '}
            but need{' '}
            <span className="tabular-nums text-ink">{required.toLocaleString()}</span> ·{' '}
            short by{' '}
            <span className="tabular-nums text-[#ff7a3d]">{short.toLocaleString()}</span>.
          </p>
          <Link
            href="/settings#billing"
            className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-[#0099ff] px-3 text-[12px] font-medium text-white transition hover:bg-[#1aa6ff]"
          >
            Top up credits
          </Link>
        </div>
      </div>
    </div>
  );
}
