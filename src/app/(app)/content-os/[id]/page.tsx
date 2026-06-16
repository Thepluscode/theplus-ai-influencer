import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { publicEnv } from '@/lib/env';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { getOrCreateCurrentWorkspace } from '@/lib/workspace';
import {
  getDemoContentAtoms,
  getDemoContentPackItems,
  getDemoContentPacks,
  getDemoContentSources,
  isDemoMode,
} from '@/lib/demo-mode';
import {
  getContentSource,
  listAtomsForSource,
  listPackItems,
  listPacksForSource,
} from '@/lib/content-sources';
import type {
  ContentAtomRow,
  ContentPackItemRow,
  ContentPackRow,
  ContentSourceRow,
} from '@/lib/supabase/types';
import { SourceDetailClient } from './source-detail-client';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ContentSourceDetailPage({ params }: Props) {
  const { id } = await params;
  const demoMode = isDemoMode();

  let source: ContentSourceRow | null = null;
  let atoms: ContentAtomRow[] = [];
  let pack: ContentPackRow | null = null;
  let items: ContentPackItemRow[] = [];

  if (demoMode) {
    source = getDemoContentSources().find((s) => s.id === id) ?? null;
    if (!source) notFound();
    atoms = getDemoContentAtoms().filter((a) => a.source_id === id);
    pack = getDemoContentPacks().find((p) => p.source_id === id) ?? null;
    items = pack ? getDemoContentPackItems().filter((i) => i.pack_id === pack!.id) : [];
  } else {
    const supabaseConfigured = Boolean(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL && publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
    if (!supabaseConfigured) notFound();

    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) notFound();
    const ws = await getOrCreateCurrentWorkspace(user);

    source = await getContentSource(id);
    if (!source || source.workspace_id !== ws.id) notFound();

    atoms = await listAtomsForSource(id);
    const packs = await listPacksForSource(id);
    pack = packs[0] ?? null;
    items = pack ? await listPackItems(pack.id) : [];
  }

  return (
    <div className="app-page text-ink">
      <header className="app-page-header">
        <Link
          href="/content-os"
          className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted transition hover:text-ink"
        >
          <ArrowLeft size={13} />
          Content OS
        </Link>
        <h1 className="mt-2 text-[20px] font-semibold">{source.title}</h1>
        <p className="mt-1 text-[12px] uppercase tracking-wider text-ink-muted">
          {source.type} · {source.status}
        </p>
      </header>

      <SourceDetailClient
        source={source}
        atoms={atoms}
        pack={pack}
        items={items}
        demoMode={demoMode}
      />
    </div>
  );
}
