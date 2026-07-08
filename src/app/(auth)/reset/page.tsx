import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { publicEnv } from '@/lib/env';
import { ResetForm } from './reset-form';

export default async function ResetPage() {
  // The recovery email link routes through /auth/callback which exchanges
  // the code into a session. By the time we land here the user should be
  // authenticated. If they aren't, the form will reject the update and
  // tell them to request a new email — we surface that up front.
  let signedIn = false;
  if (publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  }

  if (!signedIn) {
    // Direct visits without a recovery session don't belong here.
    redirect('/forgot');
  }

  return (
    <div className="auth-flow">
      <header>
        <h1>Set a new password</h1>
        <p>
          You&apos;re signed in via the recovery link. Pick a new password and we&apos;ll finish you
          off at the dashboard.
        </p>
      </header>

      <ResetForm />

      <p className="auth-switch-copy">
        Changed your mind? <Link href="/sign-in">Back to sign in</Link>
      </p>
    </div>
  );
}
