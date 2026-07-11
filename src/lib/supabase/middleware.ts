import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicEnv } from '@/lib/env';

const PROTECTED_PREFIXES = [
  '/content-os',
  '/dashboard',
  '/studio',
  '/create-post',
  '/series',
  '/storyboard',
  '/calendar',
  '/comments',
  '/inbox',
  '/analytics',
  '/safety',
  '/agents',
  '/accounts',
  '/settings',
];
const AUTH_ONLY_PREFIXES = ['/sign-in', '/sign-up'];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (
    process.env.THEPLUS_DEMO_MODE &&
    ['1', 'true'].includes(process.env.THEPLUS_DEMO_MODE.toLowerCase()) &&
    process.env.NODE_ENV !== 'production'
  ) {
    return response;
  }

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAuthOnly = AUTH_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (process.env.NODE_ENV === 'production' && isProtected) {
      const url = request.nextUrl.clone();
      url.pathname = '/sign-in';
      url.searchParams.set('returnTo', pathname);
      return NextResponse.redirect(url);
    }
    // Supabase not configured yet — in local/test, let everything through so
    // scaffold pages remain inspectable without env keys.
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
