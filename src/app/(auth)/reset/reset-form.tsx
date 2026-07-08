'use client';

import { useActionState } from 'react';
import { updatePasswordAction, type AuthResult } from '../actions';

export function ResetForm() {
  const [state, formAction, pending] = useActionState<AuthResult | null, FormData>(
    updatePasswordAction,
    null,
  );

  return (
    <form action={formAction} className="auth-form">
      <label>
        <span>New password</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={8} />
        <small>Min 8 characters.</small>
      </label>
      {state && !state.ok ? (
        <p className="auth-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="auth-submit">
        {pending ? 'Updating…' : 'Set new password'}
      </button>
    </form>
  );
}
