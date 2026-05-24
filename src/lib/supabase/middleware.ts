import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicEnv } from '@/lib/env';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/studio',
  '/create-post',
  '/calendar',
  '/accounts',
  '/settings',
];
const AUTH_ONLY_PREFIXES = ['/sign-in', '/sign-up'];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    // Supabase not configured yet — let everything through so the dev can
    // still see scaffold pages without env keys. Real protection kicks in
    // once the env vars are set.
    return response;
  }

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() revalidates the JWT against Supabase. Don't trust
  // session-from-cookie in middleware — that's spoofable.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAuthOnly = AUTH_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthOnly) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return response;
}
