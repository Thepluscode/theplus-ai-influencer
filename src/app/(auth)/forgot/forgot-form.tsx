'use client';

import { useActionState } from 'react';
import { requestPasswordResetAction, type AuthResult } from '../actions';

export function ForgotForm() {
  const [state, formAction, pending] = useActionState<AuthResult | null, FormData>(
    requestPasswordResetAction,
    null,
  );

  if (state?.ok) {
    return (
      <div className="auth-success">
        <p className="font-medium">Check your inbox.</p>
        <p className="mt-1 text-[#bbf7d0]/80">
          If an account exists for that email, we&apos;ve sent a recovery link. The link expires in
          1 hour.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="auth-form">
      <label>
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" required />
      </label>
      {state && !state.ok ? (
        <p className="auth-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="auth-submit">
        {pending ? 'Sending…' : 'Send recovery email'}
      </button>
    </form>
  );
}
