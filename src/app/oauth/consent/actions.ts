'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const DecisionSchema = z.object({
  authorizationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  decision: z.enum(['approve', 'deny']),
});

export async function decideAuthorization(formData: FormData): Promise<void> {
  const parsed = DecisionSchema.safeParse({
    authorizationId: formData.get('authorizationId'),
    decision: formData.get('decision'),
  });
  if (!parsed.success) throw new Error('Invalid authorization decision.');

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const { authorizationId, decision } = parsed.data;
  // skipBrowserRedirect: this runs on the server, so we redirect ourselves to
  // the URL Supabase returns (it already validated the client's redirect_uri).
  const result =
    decision === 'approve'
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        });
  if (result.error || !result.data?.redirect_url) {
    console.error('[oauth-consent] decision failed', {
      decision,
      error: result.error?.message ?? 'no redirect_url',
    });
    throw new Error('The authorization could not be completed. Start again from your app.');
  }
  console.info(JSON.stringify({ oauth_consent: { userId: user.id, decision } }));
  redirect(result.data.redirect_url);
}
