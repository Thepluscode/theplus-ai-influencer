'use client';

import { useActionState } from 'react';
import { updatePasswordAction, type AuthResult } from '../actions';

export function ResetForm() {
  const [state, formAction, pending] = useActionState<AuthResult | null, FormData>(
    updatePasswordAction,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 text-[13px]">
      <label className="flex flex-col gap-1.5">
        <span className="text-ink-muted">New password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="h-10 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-ink outline-none transition focus:border-[#0099ff]"
        />
        <span className="text-[11px] text-[#666]">Min 8 characters.</span>
      </label>
      {state && !state.ok ? (
        <p
          className="rounded-[10px] border border-[#ef4444]/30 bg-[#ef4444]/10 px-3 py-2 text-[12px] text-[#fca5a5]"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-[10px] bg-white px-3 font-medium text-black transition hover:bg-white/90 disabled:opacity-60"
      >
        {pending ? 'Updating…' : 'Set new password'}
      </button>
    </form>
  );
}
