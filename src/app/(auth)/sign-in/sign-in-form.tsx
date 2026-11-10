'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { signInWithPassword, type AuthResult } from '../actions';

export function SignInForm({ returnTo }: { returnTo?: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState<AuthResult | null, FormData>(
    signInWithPassword,
    null,
  );

  return (
    <form action={formAction} className="auth-form">
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <label>
        <span>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@yourbrand.com"
          required
        />
      </label>
      <label>
        <span>Password</span>
        <div className="auth-password-field">
          <input
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            minLength={8}
          />
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </label>
      {state && !state.ok ? (
        <p className="auth-error" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="auth-submit">
        <span>{pending ? 'Signing in…' : 'Continue'}</span>
        <ArrowRight size={18} />
      </button>
      <Link href="/forgot" className="auth-forgot-link">
        Forgot password?
      </Link>
    </form>
  );
}
