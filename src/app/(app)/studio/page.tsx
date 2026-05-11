import { StudioWizard } from './studio-wizard';
import { serverEnv } from '@/lib/env';

export default function StudioPage() {
  const lumaConfigured = Boolean(serverEnv.LUMA_API_KEY);

  return (
    <div className="px-10 py-10">
      <header className="mb-8 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">Studio</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Define an AI influencer persona and Luma renders a portrait + full-body shot in
          parallel. The two outputs share the same prompt subject so they read as the same
          person from different framings.
        </p>
        {!lumaConfigured ? (
          <p className="mt-3 inline-block rounded-md border border-amber-900/50 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-300">
            LUMA_API_KEY missing — set it in <code className="font-mono">.env.local</code> to
            generate. The form will still validate locally.
          </p>
        ) : null}
      </header>

      <StudioWizard />
    </div>
  );
}
