import Link from 'next/link';
import { signInWithOAuth } from '../actions';
import { SignUpForm } from './sign-up-form';

export default function SignUpPage() {
  return (
    <div className="auth-flow">
      <header>
        <h1>Create your account</h1>
        <p>Start with a workspace built for source-to-channel production.</p>
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

      <SignUpForm />

      <p className="auth-switch-copy">
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </div>
  );
}
