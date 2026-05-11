import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { publicEnv } from '@/lib/env';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let userEmail: string | null = null;

  // If Supabase isn't configured yet, render the shell anyway so the dev can
  // still preview surfaces. Auth-enforcement happens in middleware once envs
  // are set; the layout just decorates with the user when present.
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
    <div className="flex min-h-dvh bg-zinc-950 text-zinc-100">
      <Sidebar userEmail={userEmail} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
