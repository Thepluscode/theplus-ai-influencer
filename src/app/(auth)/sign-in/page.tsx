import Link from 'next/link';
import { signInWithOAuth } from '../actions';
import { SignInForm } from './sign-in-form';
import { isDemoMode } from '@/lib/demo-mode';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const demoMode = isDemoMode();

  return (
    <div className="auth-flow">
      <header>
        <h1>Sign in</h1>
        <p>Welcome back. Continue running the content engine.</p>
      </header>

      <div className="auth-oauth-grid">
        <form action={signInWithOAuth.bind(null, 'google')}>
          <button type="submit" className="auth-oauth-button">
            Continue with Google
          </button>
        </form>
        <form action={signInWithOAuth.bind(null, 'github')}>
          <button type="submit" className="auth-oauth-button">
            Continue with GitHub
          </button>
        </form>
      </div>

      <div className="auth-divider">
        <span />
        or with email
        <span />
      </div>

      <SignInForm returnTo={returnTo} />

      {demoMode ? (
        <Link href="/dashboard" className="auth-demo-button">
          Open demo workspace
        </Link>
      ) : null}

      <p className="auth-switch-copy">
        New here? <Link href="/sign-up">Create an account</Link>
      </p>
    </div>
  );
}
