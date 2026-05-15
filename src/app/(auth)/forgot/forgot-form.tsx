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
      <div className="rounded-[12px] border border-[#22c55e]/30 bg-[#22c55e]/10 p-4 text-[13px] text-[#86efac]">
        <p className="font-medium">Check your inbox.</p>
        <p className="mt-1 text-[#bbf7d0]/80">
          If an account exists for that email, we&apos;ve sent a recovery link. The link expires in
          1 hour.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 text-[13px]">
      <label className="flex flex-col gap-1.5">
        <span className="text-ink-muted">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-10 rounded-[10px] border border-[#262626] bg-surface-2 px-3 text-ink outline-none transition focus:border-[#0099ff]"
        />
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
        {pending ? 'Sending…' : 'Send recovery email'}
      </button>
    </form>
  );
}
