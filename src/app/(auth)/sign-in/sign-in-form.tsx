'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signInWithPassword, type AuthResult } from '../actions';

export function SignInForm({ returnTo }: { returnTo?: string }) {
  const [state, formAction, pending] = useActionState<AuthResult | null, FormData>(
    signInWithPassword,
    null,
  );

  return (
    <form action={formAction} className="auth-form">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <label>
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        <div className="auth-label-row">
          <span>Password</span>
          <Link
            href="/forgot"
            className="text-[11px] text-white/42 underline-offset-2 transition hover:text-white hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
        />
      </label>
      {state && !state.ok ? (
        <p className="auth-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="auth-submit">
        {pending ? 'Signing in…' : 'Continue'}
      </button>
    </form>
  );
}
