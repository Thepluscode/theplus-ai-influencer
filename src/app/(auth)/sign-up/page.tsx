import Link from 'next/link';
import { signInWithOAuth } from '../actions';
import { SignUpForm } from './sign-up-form';

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-zinc-400">Spin up your first AI influencer in minutes.</p>
      </header>

      <div className="flex flex-col gap-2 text-sm">
        <form action={signInWithOAuth.bind(null, 'google')}>
          <button
            type="submit"
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-900"
          >
            Continue with Google
          </button>
        </form>
        <form action={signInWithOAuth.bind(null, 'github')}>
          <button
            type="submit"
            className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-900"
          >
            Continue with GitHub
          </button>
        </form>
      </div>

      <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-zinc-600">
        <span className="h-px flex-1 bg-zinc-800" />
        or with email
        <span className="h-px flex-1 bg-zinc-800" />
      </div>

      <SignUpForm />

      <p className="text-center text-xs text-zinc-500">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-zinc-300 underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
