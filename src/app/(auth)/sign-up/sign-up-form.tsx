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
      <div role="status" className="auth-success">
        Account created. Check your inbox for a confirmation link, then sign in.
      </div>
    );
  }

  return (
    <form action={formAction} className="auth-form">
      <label>
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        <span>Password</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={8} />
        <small>Min 8 characters.</small>
      </label>
      {state && !state.ok ? (
        <p className="auth-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="auth-submit">
        {pending ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}
