import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { sanitizeReturnTo } from '@/lib/auth-redirect';

/**
 * Supabase redirects here after OAuth (Google/GitHub) and after email-confirm
 * links. We exchange the `?code=` for a real session, then bounce to wherever
 * the user was trying to go (or /dashboard).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = sanitizeReturnTo(url.searchParams.get('next')) ?? '/dashboard';

  if (!code) {
    return NextResponse.redirect(new URL('/sign-in?error=missing_code', request.url));
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const errUrl = new URL('/sign-in', request.url);
    errUrl.searchParams.set('error', error.message);
    return NextResponse.redirect(errUrl);
  }

  return NextResponse.redirect(new URL(next, request.url));
}
