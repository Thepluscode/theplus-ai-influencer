import Link from 'next/link';
import { signInWithOAuth } from '../actions';
import { SignInForm } from './sign-in-form';
import { isDemoMode } from '@/lib/demo-mode';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const demoMode = isDemoMode();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#666]">
          Workspace access
        </p>
        <h1 className="mt-2 text-[26px] font-medium tracking-normal text-ink">Sign in</h1>
        <p className="mt-1 text-[13px] text-ink-muted">Welcome back to the review room.</p>
      </header>

      <div className="flex flex-col gap-2 text-sm">
        <form action={signInWithOAuth.bind(null, 'google')}>
          <button
            type="submit"
            className="h-10 w-full rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[13px] text-ink-muted transition hover:border-[#444] hover:text-ink"
          >
            Continue with Google
          </button>
        </form>
        <form action={signInWithOAuth.bind(null, 'github')}>
          <button
            type="submit"
            className="h-10 w-full rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-[13px] text-ink-muted transition hover:border-[#444] hover:text-ink"
          >
            Continue with GitHub
          </button>
        </form>
      </div>

      <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-[#666]">
        <span className="h-px flex-1 bg-[#262626]" />
        or with email
        <span className="h-px flex-1 bg-[#262626]" />
      </div>

      <SignInForm returnTo={returnTo} />

      {demoMode ? (
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#0099ff]/40 bg-[#0099ff]/10 px-3 text-[13px] font-medium text-[#79cfff] transition hover:bg-[#0099ff]/15"
        >
          Open demo workspace
        </Link>
      ) : null}

      <p className="text-center text-[12px] text-ink-muted">
        New here?{' '}
        <Link href="/sign-up" className="text-ink underline-offset-2 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
