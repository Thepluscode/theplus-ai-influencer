import Link from 'next/link';
import { ForgotForm } from './forgot-form';

export default function ForgotPage() {
  return (
    <div className="auth-flow">
      <header>
        <h1>Forgot password</h1>
        <p>We&apos;ll email you a recovery link so you can get back into the engine.</p>
      </header>

      <ForgotForm />

      <p className="auth-switch-copy">
        Remembered it? <Link href="/sign-in">Back to sign in</Link>
      </p>
    </div>
  );
}
