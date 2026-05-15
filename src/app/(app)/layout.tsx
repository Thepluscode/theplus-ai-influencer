import { redirect } from 'next/navigation';
import { AppTopbar } from '@/components/layout/app-topbar';
import { CreditsPill } from '@/components/credits/credits-pill';
import { Sidebar } from '@/components/layout/sidebar';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { publicEnv } from '@/lib/env';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let userEmail: string | null = null;

  if (publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
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
    <div className="relative flex h-dvh overflow-hidden bg-[#070707] text-ink">
      <Sidebar userEmail={userEmail} />
      <main className="relative min-w-0 flex-1 overflow-hidden">
        <AppTopbar
          credits={
            <div className="shrink-0">
              <CreditsPill />
            </div>
          }
        />
        <div className="h-[calc(100dvh-65px)] overflow-y-auto bg-[#070707]">{children}</div>
      </main>
    </div>
  );
}
