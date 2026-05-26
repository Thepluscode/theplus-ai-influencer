import { format } from 'date-fns';
import { ShieldCheck } from 'lucide-react';
import { publicEnv } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { SafetyAuditRow } from '@/lib/supabase/types';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import { SafetyForm } from './safety-form';
import { cn } from '@/lib/utils';

type Issue = { severity: 'low' | 'medium' | 'high'; code: string; message: string };

export default async function SafetyPage() {
  const supabaseConfigured = Boolean(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  let audits: SafetyAuditRow[] = [];
  let loadError: string | null = null;
  if (supabaseConfigured) {
    try {
      const supabase = await getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const ws = await getOrCreateCurrentWorkspace(user);
        const { data, error } = await supabase
          .from('safety_audits')
          .select('*')
          .eq('workspace_id', ws.id)
          .order('created_at', { ascending: false })
          .limit(20);
        if (error) throw error;
        audits = data ?? [];
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Unknown error';
    }
  }

  return (
    <div className="app-page text-ink">
      <div className="app-page-inner">
        <header className="app-page-header">
          <p className="framer-eyebrow">Brand-safety</p>
          <h1 className="mt-2 text-[28px] font-medium leading-[1.05] tracking-normal text-balance sm:text-[32px]">
            Audit before you ship.
            <br />
            Save the account.
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-[1.5] text-ink-muted">
            A pre-publish check on the caption (and image URL if given). Returns pass / warn / block
            with specific issues + fix suggestions. Use it inline before scheduling, or audit a
            draft caption here.
          </p>
          {loadError ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#ff5577]/40 bg-[#ff5577]/[0.07] px-3 py-1.5 text-[12px] text-[#ff5577]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff5577]" />
              {loadError}
            </p>
          ) : null}
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <SafetyForm />

          <aside className="rounded-[16px] border border-[#262626] bg-surface-1 p-4 xl:sticky xl:top-0 xl:self-start">
            <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              Recent audits
            </h2>
            {audits.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-[#262626] px-3 py-6 text-center text-[12px] text-ink-muted">
                No audits yet. Run a check on the left.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {audits.map((a) => (
                  <AuditRow key={a.id} audit={a} />
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function AuditRow({ audit }: { audit: SafetyAuditRow }) {
  const issues = (Array.isArray(audit.issues) ? audit.issues : []) as Issue[];
  const tone =
    audit.verdict === 'pass'
      ? 'border-[#22c55e]/30 bg-[#22c55e]/[0.06] text-[#22c55e]'
      : audit.verdict === 'warn'
        ? 'border-[#ff7a3d]/30 bg-[#ff7a3d]/[0.06] text-[#ff7a3d]'
        : 'border-[#ff5577]/30 bg-[#ff5577]/[0.06] text-[#ff5577]';
  return (
    <li className={cn('rounded-[10px] border px-3 py-2', tone)}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider">
          <ShieldCheck size={11} />
          {audit.verdict}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-ink-muted">
          {format(new Date(audit.created_at), 'MMM d, h:mm a')}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] text-ink-muted" title={audit.caption}>
        {audit.caption}
      </p>
      {issues.length > 0 ? (
        <p className="mt-1 text-[10px] uppercase tracking-wider text-ink-muted">
          {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
        </p>
      ) : null}
    </li>
  );
}
