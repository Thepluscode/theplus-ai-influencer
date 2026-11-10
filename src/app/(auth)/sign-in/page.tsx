import Link from 'next/link';
import { BriefcaseBusiness, LockKeyhole } from 'lucide-react';
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
        <p>Welcome back. Let&apos;s keep producing.</p>
      </header>

      <SignInForm returnTo={returnTo} />

      {demoMode ? (
        <>
          <div className="auth-workspace-divider">
            <span>Your workspace</span>
          </div>
          <div className="auth-workspace-card">
            <BriefcaseBusiness size={18} />
            <div>
              <strong>Demo Workspace</strong>
              <span>Pro plan&nbsp; · &nbsp;12,450 credits</span>
            </div>
            <Link href="/dashboard">Open</Link>
          </div>
        </>
      ) : null}

      <p className="auth-security-note">
        <LockKeyhole size={15} />
        Your data is encrypted and never published without approval.
      </p>

      <p className="auth-switch-copy">
        New here? <Link href="/sign-up">Create an account</Link>
      </p>
    </div>
  );
}
