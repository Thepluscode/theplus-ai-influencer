import 'server-only';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type {
  CreativeAgentAssetRow,
  CreativeAgentReviewIssueRow,
  CreativeAgentRunRow,
} from '@/lib/supabase/types';
import type { CreativeAgentRunPayload } from '@/lib/creative-agents-schema';
import { stubStoryboardImage } from '@/lib/luma-stub';
import { saveStoryboard } from '@/lib/storyboards';
import type { RenderedShot } from '@/lib/storyboard';

export type CreativeAgentRunSummary = Pick<
  CreativeAgentRunRow,
  | 'id'
  | 'campaign_title'
  | 'concept_line'
  | 'agent_status'
  | 'asset_count'
  | 'fixed_issue_count'
  | 'storyboard_id'
  | 'created_at'
>;

type SavedCreativeAgentRun = {
  run: CreativeAgentRunRow;
  issueIds: Record<string, string>;
};

export async function listCreativeAgentRuns(
  workspaceId: string,
  limit = 6,
): Promise<CreativeAgentRunSummary[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('creative_agent_runs')
    .select(
      'id,campaign_title,concept_line,agent_status,asset_count,fixed_issue_count,storyboard_id,created_at',
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`Failed to list creative agent runs: ${error.message}`);
  }
  return data ?? [];
}

export async function saveCreativeAgentRun(input: {
  workspaceId: string;
  payload: CreativeAgentRunPayload;
  status?: CreativeAgentRunRow['agent_status'];
}): Promise<SavedCreativeAgentRun> {
  const supabase = await getSupabaseServerClient();
  const fixed = new Set(input.payload.fixedIssueIds);
  const fixedIssueCount = input.payload.run.reviewIssues.filter(
    (issue) => issue.severity === 'fixing' && fixed.has(issue.id),
  ).length;

  const { data: run, error: runError } = await supabase
    .from('creative_agent_runs')
    .insert({
      workspace_id: input.workspaceId,
      prompt: input.payload.prompt,
      campaign_title: input.payload.run.campaignTitle,
      concept_line: input.payload.run.conceptLine,
      brand_defaults: input.payload.brandDefaults,
      agent_status: input.status ?? 'saved',
      asset_count: input.payload.run.assetCount,
      fixed_issue_count: fixedIssueCount,
    })
    .select('*')
    .single();
  if (runError || !run) {
    throw new Error(`Failed to save creative agent run: ${runError?.message ?? 'no row'}`);
  }

  const assets = buildAssetRows(input.workspaceId, run.id, input.payload);
  if (assets.length > 0) {
    const { error } = await supabase.from('creative_agent_assets').insert(assets);
    if (error) {
      throw new Error(`Failed to save creative agent assets: ${error.message}`);
    }
  }

  const issues = input.payload.run.reviewIssues.map((issue): CreativeIssueInsert => {
    const fixedStatus = fixed.has(issue.id);
    return {
      run_id: run.id,
      workspace_id: input.workspaceId,
      external_id: issue.id,
      asset_label: issue.asset,
      severity: issue.severity,
      label: issue.label,
      before: issue.before,
      fix: issue.fix,
      status: issue.severity === 'clear' ? 'clear' : fixedStatus ? 'fixed' : 'open',
      fixed_at: fixedStatus ? new Date().toISOString() : null,
    };
  });
  const issueIds: Record<string, string> = {};
  if (issues.length > 0) {
    const { data, error } = await supabase
      .from('creative_agent_review_issues')
      .insert(issues)
      .select('id,external_id');
    if (error) {
      throw new Error(`Failed to save creative agent review issues: ${error.message}`);
    }
    for (const issue of data ?? []) {
      issueIds[issue.external_id] = issue.id;
    }
  }

  return { run, issueIds };
}

export async function markCreativeAgentReviewIssueFixed(input: {
  workspaceId: string;
  runId: string;
  issueId: string;
}): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from('creative_agent_review_issues')
    .update({ status: 'fixed', fixed_at: new Date().toISOString() })
    .eq('id', input.issueId)
    .eq('run_id', input.runId)
    .eq('workspace_id', input.workspaceId)
    .select('id')
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to mark creative agent issue fixed: ${error.message}`);
  }
  if (!data) {
    throw new Error('Creative agent issue not found.');
  }

  const { count, error: countError } = await supabase
    .from('creative_agent_review_issues')
    .select('id', { count: 'exact', head: true })
    .eq('run_id', input.runId)
    .eq('workspace_id', input.workspaceId)
    .eq('status', 'fixed');
  if (countError) {
    throw new Error(`Failed to count fixed creative agent issues: ${countError.message}`);
  }

  const { error: runError } = await supabase
    .from('creative_agent_runs')
    .update({ fixed_issue_count: count ?? 0 })
    .eq('id', input.runId)
    .eq('workspace_id', input.workspaceId);
  if (runError) {
    throw new Error(`Failed to update creative agent run: ${runError.message}`);
  }
}

export async function sendCreativeAgentRunToStoryboard(input: {
  workspaceId: string;
  payload: CreativeAgentRunPayload;
  runId?: string | null;
}): Promise<{ runId: string; storyboardId: string }> {
  const supabase = await getSupabaseServerClient();
  let runId = input.runId ?? null;

  if (!runId) {
    const saved = await saveCreativeAgentRun({
      workspaceId: input.workspaceId,
      payload: input.payload,
      status: 'sent_to_storyboard',
    });
    runId = saved.run.id;
  } else {
    const { data: existingRun, error } = await supabase
      .from('creative_agent_runs')
      .select('id')
      .eq('id', runId)
      .eq('workspace_id', input.workspaceId)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to verify creative agent run: ${error.message}`);
    }
    if (!existingRun) {
      throw new Error('Creative agent run not found.');
    }
  }

  const storyboard = await saveStoryboard({
    workspaceId: input.workspaceId,
    modelId: null,
    name: input.payload.run.campaignTitle,
    brief: input.payload.prompt,
    format: 'portrait',
    summary: input.payload.run.conceptLine,
    shots: buildStoryboardShots(input.payload, runId),
  });

  const { data: linkedRun, error } = await supabase
    .from('creative_agent_runs')
    .update({ storyboard_id: storyboard.id, agent_status: 'sent_to_storyboard' })
    .eq('id', runId)
    .eq('workspace_id', input.workspaceId)
    .select('id')
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to link creative agent run to storyboard: ${error.message}`);
  }
  if (!linkedRun) {
    throw new Error('Creative agent run not found after storyboard handoff.');
  }

  return { runId, storyboardId: storyboard.id };
}

type CreativeAssetInsert = Omit<CreativeAgentAssetRow, 'id' | 'created_at'>;
type CreativeIssueInsert = Omit<CreativeAgentReviewIssueRow, 'id' | 'created_at' | 'updated_at'>;

function buildAssetRows(
  workspaceId: string,
  runId: string,
  payload: CreativeAgentRunPayload,
): CreativeAssetInsert[] {
  let position = 0;
  const rows: CreativeAssetInsert[] = [];
  const push = (
    kind: CreativeAssetInsert['kind'],
    title: string,
    body: string,
    metadata: Record<string, unknown> = {},
  ) => {
    rows.push({ run_id: runId, workspace_id: workspaceId, kind, title, body, metadata, position });
    position += 1;
  };

  push('concept', payload.run.campaignTitle, payload.run.conceptLine);
  payload.run.script.forEach((body, index) => push('script', `Script beat ${index + 1}`, body));
  payload.run.voiceover.forEach((body, index) =>
    push('voiceover', `Voiceover line ${index + 1}`, body),
  );
  push('music', 'Music cue', payload.run.musicCue);
  payload.run.soundDesign.forEach((body, index) =>
    push('sound_design', `Sound design ${index + 1}`, body),
  );
  payload.run.brandIdentity.forEach((body, index) =>
    push('brand_identity', `Brand identity ${index + 1}`, body),
  );
  payload.run.shots.forEach((shot) =>
    push('shot', `Shot ${shot.index}: ${shot.title}`, shot.frame, {
      camera: shot.camera,
      prompt: shot.prompt,
      audio: shot.audio,
      qualityGate: shot.qualityGate,
    }),
  );
  payload.run.composeNotes.forEach((body, index) =>
    push('compose_note', `Compose note ${index + 1}`, body),
  );
  return rows;
}

function buildStoryboardShots(payload: CreativeAgentRunPayload, runId: string): RenderedShot[] {
  return payload.run.shots.map((shot, index) => ({
    index,
    prompt: shot.prompt,
    hookCaption: shot.title,
    durationMs: index === 0 ? 2200 : index === payload.run.shots.length - 1 ? 3000 : 2500,
    imageUrl: stubStoryboardImage(payload.run.campaignTitle, index, payload.run.shots.length),
    generationId: `agent-${runId}-${shot.index}`,
    generatedAt: new Date().toISOString(),
  }));
}
