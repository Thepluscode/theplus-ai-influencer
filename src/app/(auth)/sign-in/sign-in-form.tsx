'use client';

import { useActionState } from 'react';
import { signInWithPassword, type AuthResult } from '../actions';

export function SignInForm({ returnTo }: { returnTo?: string }) {
  const [state, formAction, pending] = useActionState<AuthResult | null, FormData>(
    signInWithPassword,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 text-sm">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <label className="flex flex-col gap-1">
        <span className="text-zinc-400">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-zinc-400">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
        />
      </label>
      {state && !state.ok ? (
        <p className="text-xs text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-100 px-3 py-2 font-medium text-zinc-900 transition hover:bg-white disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
