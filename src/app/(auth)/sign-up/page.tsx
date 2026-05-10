import Link from 'next/link';

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Email + password / GitHub / Google via Supabase. Wire this up next.
        </p>
      </header>
      <div className="flex flex-col gap-3 text-sm">
        <button
          disabled
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-500"
        >
          Continue with Google (TODO)
        </button>
        <button
          disabled
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-500"
        >
          Continue with GitHub (TODO)
        </button>
      </div>
      <p className="text-center text-xs text-zinc-500">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-zinc-300 underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
