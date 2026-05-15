import Link from 'next/link';
import { ForgotForm } from './forgot-form';

export default function ForgotPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#666]">
          Account recovery
        </p>
        <h1 className="mt-2 text-[26px] font-medium tracking-normal text-ink">Forgot password</h1>
        <p className="mt-1 text-[13px] text-ink-muted">
          We&apos;ll email you a recovery link. Click it to set a new password.
        </p>
      </header>

      <ForgotForm />

      <p className="text-center text-[12px] text-ink-muted">
        Remembered it?{' '}
        <Link href="/sign-in" className="text-ink underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
