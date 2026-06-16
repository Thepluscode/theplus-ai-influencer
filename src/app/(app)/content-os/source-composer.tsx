'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  CONTENT_SOURCE_MAX_BYTES,
  UPLOAD_ACCEPT,
  sourceTypeFromMime,
} from '@/lib/content-sources-schema';
import { createContentSourceAction } from './actions';

interface Props {
  workspaceId: string | null;
  demoMode: boolean;
}

type Mode = 'paste' | 'upload';

export function SourceComposer({ workspaceId, demoMode }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('paste');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const busy = pending || uploading;

  function pickFile(f: File) {
    setError(null);
    if (f.size > CONTENT_SOURCE_MAX_BYTES) {
      setError(`Too large (${(f.size / 1024 / 1024).toFixed(1)} MB · 25 MB max).`);
      return;
    }
    if (!sourceTypeFromMime(f.type)) {
      setError('Unsupported file. Use txt, md, pdf, or an audio/video file.');
      return;
    }
    setFile(f);
  }

  function reset() {
    setText('');
    setTitle('');
    setFile(null);
    setError(null);
  }

  async function submit() {
    setError(null);

    if (mode === 'paste') {
      if (!text.trim()) {
        setError('Paste some text to extract from.');
        return;
      }
      startTransition(async () => {
        const res = await createContentSourceAction({
          mode: 'paste',
          text,
          title: title.trim() || undefined,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        reset();
        router.push(`/content-os/${res.sourceId}`);
      });
      return;
    }

    // upload mode
    if (!file) {
      setError('Choose a file first.');
      return;
    }

    // Demo mode: skip the real storage upload (no session); the action
    // short-circuits to the deterministic demo source.
    if (demoMode) {
      startTransition(async () => {
        const res = await createContentSourceAction({
          mode: 'upload',
          storagePath: `demo/${file.name}`,
          mimeType: file.type,
          byteSize: file.size,
          title: title.trim() || undefined,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        reset();
        router.push(`/content-os/${res.sourceId}`);
      });
      return;
    }

    if (!workspaceId) {
      setError('Sign in to upload a source.');
      return;
    }

    setUploading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const path = `${workspaceId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('content-sources')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const captured = { path, type: file.type, size: file.size, name: file.name };
      startTransition(async () => {
        const res = await createContentSourceAction({
          mode: 'upload',
          storagePath: captured.path,
          mimeType: captured.type,
          byteSize: captured.size,
          title: title.trim() || captured.name,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        reset();
        router.push(`/content-os/${res.sourceId}`);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-[16px] border border-[#262626] bg-surface-2/40 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles size={15} className="text-[#0099ff]" />
        <h2 className="text-[14px] font-medium text-ink">New source</h2>
        <span className="ml-auto text-[11px] text-ink-muted">Extract → repackage → distribute</span>
      </div>

      <div className="mb-4 inline-flex rounded-full border border-[#262626] bg-[#0c0c0c] p-0.5 text-[12px]">
        {(['paste', 'upload'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={cn(
              'rounded-full px-3 py-1 capitalize transition',
              mode === m ? 'bg-[#0099ff] text-white' : 'text-ink-muted hover:text-ink',
            )}
          >
            {m === 'paste' ? 'Paste text' : 'Upload file'}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="mb-3 w-full rounded-[10px] border border-[#262626] bg-[#0c0c0c] px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-muted focus:border-[#0099ff]/60"
      />

      {mode === 'paste' ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Paste an article, transcript, notes, or any long-form source…"
          className="w-full resize-y rounded-[10px] border border-[#262626] bg-[#0c0c0c] px-3 py-2 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-muted focus:border-[#0099ff]/60"
        />
      ) : file ? (
        <div className="flex items-center gap-3 rounded-[10px] border border-[#262626] bg-[#0c0c0c] px-3 py-3 text-[13px] text-ink">
          <FileText size={16} className="text-[#0099ff]" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="text-[11px] text-ink-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
          <button type="button" onClick={() => setFile(null)} aria-label="Remove file">
            <X size={14} className="text-ink-muted hover:text-ink" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-[110px] w-full items-center justify-center gap-3 rounded-[10px] border border-dashed border-[#262626] bg-[#0c0c0c] px-4 text-[13px] text-ink-muted transition hover:border-[#444] hover:text-ink"
        >
          <Upload size={16} />
          <span>Upload txt, md, pdf, audio, or video · 25 MB max</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pickFile(f);
          e.target.value = '';
        }}
      />

      {error ? <p className="mt-2 text-[12px] text-[#ff5577]">{error}</p> : null}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-[#0099ff] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-[#0088ee] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {busy ? 'Adding…' : 'Add source & extract'}
        </button>
      </div>
    </div>
  );
}
