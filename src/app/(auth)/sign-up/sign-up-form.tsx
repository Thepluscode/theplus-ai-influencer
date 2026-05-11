'use client';

import { useActionState } from 'react';
import { signUpWithPassword, type AuthResult } from '../actions';

export function SignUpForm() {
  const [state, formAction, pending] = useActionState<AuthResult | null, FormData>(
    signUpWithPassword,
    null,
  );

  if (state?.ok) {
    return (
      <div
        role="status"
        className="rounded-md border border-emerald-900/50 bg-emerald-950/30 px-3 py-3 text-sm text-emerald-200"
      >
        Account created. Check your inbox for a confirmation link, then sign in.
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 text-sm">
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
          autoComplete="new-password"
          required
          minLength={8}
          className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-zinc-600"
        />
        <span className="text-xs text-zinc-600">Min 8 characters.</span>
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
        {pending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
