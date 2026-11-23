import { redirect } from 'next/navigation';
import { isDemoMode } from '@/lib/demo-mode';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { decideAuthorization } from './actions';

// Supabase Auth (OAuth 2.1 server) sends the user here to approve an MCP
// client such as Claude or ChatGPT. Configure this path as the authorization
// URL under Authentication → OAuth Server in the Supabase dashboard.

export const dynamic = 'force-dynamic';

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: authorizationId } = await searchParams;
  if (!authorizationId || !/^[A-Za-z0-9_-]{1,128}$/.test(authorizationId)) {
    return <Notice title="Invalid request">This authorization link is missing or malformed.</Notice>;
  }
  if (isDemoMode()) {
    return <Notice title="Not available in demo mode">Connect an MCP client to a real account.</Notice>;
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const returnTo = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) {
    return (
      <Notice title="Authorization unavailable">
        This request has expired or was already used. Start the connection again from your app.
      </Notice>
    );
  }
  // Already consented earlier: Supabase hands back the redirect directly.
  if (!('authorization_id' in data)) redirect(data.redirect_url);

  const scopes = data.scope.split(' ').filter(Boolean);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-[22px] font-semibold text-ink">Connect {data.client.name}</h1>
      <p className="mt-2 text-[14px] leading-6 text-ink-muted">
        <strong className="text-ink">{data.client.name}</strong> wants to use ThePlus AI Influencer
        as <strong className="text-ink">{user.email}</strong>. It will be able to read your
        influencers, generated assets and post status through MCP. It cannot publish.
      </p>
      {scopes.length > 0 ? (
        <ul className="mt-4 list-disc pl-5 text-[13px] text-ink-muted">
          {scopes.map((scope) => (
            <li key={scope}>{scope}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-4 break-all text-[12px] text-ink-muted">Returns to {data.redirect_uri}</p>
      <form action={decideAuthorization} className="mt-6 flex gap-3">
        <input type="hidden" name="authorizationId" value={data.authorization_id} />
        <button
          type="submit"
          name="decision"
          value="approve"
          className="h-10 flex-1 rounded-[10px] bg-[#0099ff] text-[14px] font-medium text-white"
        >
          Allow
        </button>
        <button
          type="submit"
          name="decision"
          value="deny"
          className="h-10 flex-1 rounded-[10px] border border-[#262626] text-[14px] text-ink"
        >
          Deny
        </button>
      </form>
    </main>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-[22px] font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-[14px] leading-6 text-ink-muted">{children}</p>
    </main>
  );
}
