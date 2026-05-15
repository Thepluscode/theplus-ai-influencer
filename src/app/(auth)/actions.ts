'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { sanitizeReturnTo } from '@/lib/auth-redirect';

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type AuthResult = { ok: true } | { ok: false; error: string };

async function getCallbackBaseUrl(): Promise<string> {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3002';
  return `${proto}://${host}`;
}

export async function signInWithPassword(
  _prevState: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = CredentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { ok: false, error: error.message };
  }

  const returnTo = sanitizeReturnTo(formData.get('returnTo'));
  revalidatePath('/', 'layout');
  redirect(returnTo ?? '/dashboard');
}

export async function signUpWithPassword(
  _prevState: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = CredentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = await getSupabaseServerClient();
  const baseUrl = await getCallbackBaseUrl();
  const { error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${baseUrl}/auth/callback?next=/dashboard` },
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  // Supabase may require email confirmation depending on project settings.
  // Either way, we can't redirect to /dashboard yet — surface success.
  return { ok: true };
}

const EmailOnlySchema = z.object({
  email: z.string().email(),
});

const PasswordOnlySchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * Send a password-recovery email. Supabase delivers a magic link that
 * lands on /auth/callback?code=... which exchanges into a real session
 * and bounces to /reset where the user picks a new password.
 *
 * We return `ok: true` even when the email doesn't exist — surfacing
 * "user not found" lets attackers enumerate emails on the platform.
 * Supabase silently noops in that case.
 */
export async function requestPasswordResetAction(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = EmailOnlySchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid email' };
  }

  const supabase = await getSupabaseServerClient();
  const baseUrl = await getCallbackBaseUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${baseUrl}/auth/callback?next=/reset`,
  });

  if (error) {
    // Only surface real config errors (e.g. SMTP not set) — never identity probes.
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Update password for the currently-signed-in user. The session is set
 * by /auth/callback after the recovery code exchange. If the user lands
 * here without a session the call fails — the form guards against that
 * and points the user back to /forgot.
 */
export async function updatePasswordAction(
  _prev: AuthResult | null,
  formData: FormData,
): Promise<AuthResult> {
  const parsed = PasswordOnlySchema.safeParse({ password: formData.get('password') });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid password' };
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: 'Reset link expired or invalid. Request a new email from /forgot.',
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signInWithOAuth(provider: 'google' | 'github') {
  const supabase = await getSupabaseServerClient();
  const baseUrl = await getCallbackBaseUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${baseUrl}/auth/callback?next=/dashboard` },
  });
  if (error || !data.url) {
    throw new Error(error?.message ?? 'OAuth init failed: no URL returned');
  }
  redirect(data.url);
}
