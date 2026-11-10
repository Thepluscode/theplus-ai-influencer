import Link from 'next/link';
import { enabledOAuthProviders, type OAuthProvider } from '@/lib/oauth-providers';
import { signInWithOAuth } from '../actions';
import { SignUpForm } from './sign-up-form';

const OAUTH_LABEL: Record<OAuthProvider, string> = { google: 'Google', github: 'GitHub' };

export default async function SignUpPage() {
  const providers = await enabledOAuthProviders();
  return (
    <div className="auth-flow">
      <header>
        <h1>Create your account</h1>
        <p>Start with a workspace built for source-to-channel production.</p>
      </header>

      {providers.length > 0 ? (
        <>
          <div className="auth-oauth-grid">
            {providers.map((p) => (
              <form key={p} action={signInWithOAuth.bind(null, p)}>
                <button type="submit" className="auth-oauth-button">
                  Continue with {OAUTH_LABEL[p]}
                </button>
              </form>
            ))}
          </div>

          <div className="auth-divider">
            <span />
            or with email
            <span />
          </div>
        </>
      ) : null}

      <SignUpForm />

      <p className="auth-switch-copy">
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </div>
  );
}
