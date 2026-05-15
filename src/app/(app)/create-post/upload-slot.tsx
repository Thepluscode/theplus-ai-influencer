'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Upload, X } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface Props {
  /** Drives slot size + accent. `final` is a large drop area, `reference`
   *  is a compact square thumbnail. */
  intent: 'final' | 'reference';
  /** Owning workspace — used as the storage path prefix per RLS. */
  workspaceId: string | null;
  /** Current URL (controlled). */
  value: string;
  /** Called after a successful upload with the public URL. */
  onChange: (url: string) => void;
  /** Disable while disabled. */
  disabled?: boolean;
}

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp';

export function UploadSlot({ intent, workspaceId, value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  async function upload(file: File) {
    setError(null);
    if (!workspaceId) {
      setError('Sign in first.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Too large (${(file.size / 1024 / 1024).toFixed(1)} MB max 10).`);
      return;
    }
    if (!ACCEPT.split(',').includes(file.type)) {
      setError('JPG/PNG/WEBP only.');
      return;
    }

    setUploading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${workspaceId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('post-uploads')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { data } = supabase.storage.from('post-uploads').getPublicUrl(path);
      if (!data?.publicUrl) throw new Error('No public URL returned.');
      onChange(data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  // ---- REFERENCE intent: compact square ----
  if (intent === 'reference') {
    if (value) {
      return (
        <div className="group relative aspect-square overflow-hidden rounded-[10px] border border-[#262626] bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={disabled}
            className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white opacity-0 ring-1 ring-white/15 backdrop-blur transition group-hover:opacity-100 hover:bg-black/90 disabled:opacity-50"
            aria-label="Remove"
          >
            <X size={11} />
          </button>
        </div>
      );
    }
    return (
      <>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) upload(f);
          }}
          disabled={uploading || disabled}
          aria-label="Upload reference image"
          title={error ?? 'Upload reference image'}
          className={cn(
            'group flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed bg-surface-2/40 text-ink-muted transition',
            isDragging
              ? 'border-solid border-[#0099ff]/60 bg-surface-2 text-[#0099ff]'
              : 'border-[#262626] hover:border-[#444] hover:text-ink',
            (uploading || disabled) && 'cursor-not-allowed opacity-50',
          )}
        >
          {uploading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              <Upload size={14} />
              <span className="text-[10px] uppercase tracking-wider">Upload</span>
            </>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = '';
          }}
          className="hidden"
        />
      </>
    );
  }

  // ---- FINAL intent: large drop area ----
  if (value) {
    return (
      <div className="relative overflow-hidden rounded-[12px] border border-[#262626] bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value}
          alt="Final image"
          className="block max-h-[200px] w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/85 to-transparent" />
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 text-[11px] text-white">
          <span className="inline-flex items-center gap-1.5 text-[#0099ff]">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Final image set · Luma bypassed
          </span>
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={disabled}
            className="pointer-events-auto inline-flex h-7 items-center gap-1 rounded-full bg-black/60 px-2.5 text-[11px] text-white ring-1 ring-white/10 transition hover:bg-black/80 disabled:opacity-50"
          >
            <X size={11} />
            Remove
          </button>
        </div>
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) upload(f);
        }}
        disabled={uploading || disabled}
        className={cn(
          'flex h-[120px] w-full items-center justify-center gap-3 rounded-[12px] border border-dashed bg-surface-2/40 px-4 text-[13px] transition',
          isDragging
            ? 'border-solid border-[#0099ff]/60 bg-surface-2 text-[#0099ff]'
            : 'border-[#262626] text-ink-muted hover:border-[#444] hover:text-ink',
          (uploading || disabled) && 'cursor-not-allowed opacity-60',
        )}
      >
        {uploading ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            <span>Uploading…</span>
          </>
        ) : (
          <>
            <ImagePlus size={16} />
            <span>Upload final image · drag-drop or click</span>
          </>
        )}
      </button>
      {error ? <p className="text-[11px] text-[#ff5577]">{error}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = '';
        }}
        className="hidden"
      />
    </>
  );
}
