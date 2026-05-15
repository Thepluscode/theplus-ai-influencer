import Link from 'next/link';
import { signInWithOAuth } from '../actions';
import { SignUpForm } from './sign-up-form';

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#666]">
          New workspace
        </p>
        <h1 className="mt-2 text-[26px] font-medium tracking-normal text-ink">
          Create your account
        </h1>
        <p className="mt-1 text-[13px] text-ink-muted">Spin up your first AI influencer.</p>
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

      <SignUpForm />

      <p className="text-center text-[12px] text-ink-muted">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-ink underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
