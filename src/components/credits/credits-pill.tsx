import Link from 'next/link';
import { Zap } from 'lucide-react';
import { publicEnv } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';

/**
 * Server component — reads the signed-in workspace's credit balance and
 * renders the pill. Lives in the top-right of the app layout. Re-rendered
 * on every page navigation, so the balance refreshes after any action
 * that calls `revalidatePath('/', 'layout')`.
 */
export async function CreditsPill() {
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  let credits = 0;
  let plan: 'free' | 'pro' | 'studio' | 'agency' = 'free';
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const ws = await getOrCreateCurrentWorkspace(user);
    const { data } = await supabase
      .from('workspaces')
      .select('credits, plan')
      .eq('id', ws.id)
      .maybeSingle();
    credits = data?.credits ?? 0;
    plan = data?.plan ?? 'free';
  } catch {
    // Best-effort — never break the layout if credits read fails (e.g.
    // user just signed up and the column is still propagating).
    return null;
  }

  const isLow = credits < 50;
  return (
    <Link
      href="/settings#billing"
      className="group inline-flex h-9 items-center gap-2.5 rounded-full border border-[#262626] bg-surface-1 pl-1 pr-3 transition hover:border-[#0099ff]/50"
      title="Credit balance · click to manage plan"
    >
      <span
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
          isLow ? 'bg-[#ff7a3d]/15 text-[#ff7a3d]' : 'bg-[#0099ff]/15 text-[#0099ff]'
        }`}
      >
        <Zap size={12} />
      </span>
      <span className="hidden flex-col items-end leading-tight sm:flex">
        <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          {plan === 'free' ? 'Credits' : `${plan} · credits`}
        </span>
        <span className="text-[13px] font-medium tabular-nums text-ink">
          {credits.toLocaleString()}
        </span>
      </span>
    </Link>
  );
}
