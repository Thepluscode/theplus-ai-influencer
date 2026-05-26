import { redirect } from 'next/navigation';
import { AppTopbar } from '@/components/layout/app-topbar';
import { CreditsPill } from '@/components/credits/credits-pill';
import { Sidebar } from '@/components/layout/sidebar';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { publicEnv } from '@/lib/env';
import { DEMO_USER_EMAIL, isDemoMode } from '@/lib/demo-mode';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const demoMode = isDemoMode();
  let userEmail: string | null = demoMode ? DEMO_USER_EMAIL : null;

  if (!demoMode && publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      redirect('/sign-in');
    }
    userEmail = user.email ?? null;
  }

  return (
    <div className="relative flex h-dvh overflow-hidden bg-[#050505] text-ink">
      <Sidebar userEmail={userEmail} demoMode={demoMode} />
      <main className="relative min-w-0 flex-1 overflow-hidden">
        <AppTopbar
          demoMode={demoMode}
          credits={
            <div className="shrink-0">
              <CreditsPill />
            </div>
          }
        />
        <div className="app-workspace-scroll h-[calc(100dvh-65px)] overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
