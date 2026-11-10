'use client';

import { useRef, useState, useTransition } from 'react';
import { ImageUp, Loader2 } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { replacePersonaImage } from './actions';

// ---------------------------------------------------------------------------
// The wizard only generates a face. This lets an operator swap in their own —
// their shoot, an existing brand character — on a persona that already exists.
//
// Two-step on purpose: the browser uploads straight to storage (so a large file
// never passes through a server action, which has a body limit), then the
// action is handed only the resulting URL and re-validates that it points at
// the persona-refs bucket. The client check below is a courtesy for the error
// message; the server does not trust it.
// ---------------------------------------------------------------------------

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

export function ReplaceImageButton({
  modelId,
  workspaceId,
  kind = 'portrait',
}: {
  modelId: string;
  workspaceId: string | null;
  kind?: 'portrait' | 'full_body';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function onPick(file: File) {
    setError(null);
    if (!workspaceId) return setError('Sign in first.');
    if (file.size > MAX_BYTES) {
      return setError(`Too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max 10).`);
    }
    if (!ACCEPT.includes(file.type)) return setError('JPG, PNG or WEBP only.');

    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      // The first path segment must be the workspace id — the bucket's RLS
      // policy (0027) gates writes on it.
      const path = `${workspaceId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('persona-refs')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const { data } = supabase.storage.from('persona-refs').getPublicUrl(path);
      if (!data?.publicUrl) throw new Error('No public URL returned.');

      const fd = new FormData();
      fd.append('modelId', modelId);
      fd.append('kind', kind);
      fd.append('url', data.publicUrl);
      const res = await replacePersonaImage(null, fd);
      if (res.status === 'error') throw new Error(res.error);

      startTransition(() => {
        // revalidatePath('/studio') in the action refreshes the card.
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Replace this persona's image with your own"
        className="inline-flex items-center gap-1.5 rounded-[10px] border border-white/10 bg-black/40 px-2.5 py-1.5 text-[12px] text-ink backdrop-blur transition hover:border-[#0099ff]/50 hover:text-[#0099ff] disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <ImageUp size={13} />}
        {busy ? 'Uploading…' : 'Replace image'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT.join(',')}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          // Reset so picking the same file twice still fires onChange.
          e.target.value = '';
          if (f) void onPick(f);
        }}
      />
      {error ? (
        <span className="mt-1 block text-[11px] text-[#ff5577]" role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
}
