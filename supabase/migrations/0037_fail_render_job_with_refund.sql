-- =============================================================================
-- 0037 — Render job progress and failure are each ONE transaction, and the
-- refund is computed from the job's own counters.
--
-- Defects (Codex task-mwvzeif8-pa30zn, then task-mwwcjltg-wr29p1; reproduced
-- on Postgres 17 before this version):
--   * The worker marked a job failed with cost_refunded, then called
--     grant_credits separately; refundCredits swallows errors. A failed grant
--     stranded the refund on a job that is never claimed again.
--   * The refund trusted shots_completed, which lagged when a shot's video was
--     saved but the separate progress write failed (over-refund). Counting the
--     storyboard's blank shots instead was worse: users can edit the shot list,
--     so appending or removing a blank shot over- or under-refunded.
--   * A late worker could mark a failed job completed (no status check).
--   * Deleting the storyboard cascades away its job, so a worker that then
--     fails the job found nothing to settle.
--
-- Design:
--   * record_storyboard_render_shot saves the storyboard shots AND advances
--     shots_completed (completing the job on the last shot) in one
--     transaction. shots_completed can no longer lag or lead the saved work,
--     so (shots_total - shots_completed) * cost_per_shot is exactly what this
--     job charged for and did not deliver.
--   * Both functions are fenced by the worker's claim token (claimed_at from
--     claim_storyboard_render_job): a worker whose claim was reclaimed, or a
--     job already finished, gets 'stale' / its recorded refund and nothing
--     changes.
--   * fail_storyboard_render_job posts the refund and marks the job failed in
--     one transaction, writing the ledger directly: an existing refund row for
--     this job is reused, anything else that goes wrong aborts the whole call
--     (grant_credits treats every unique_violation as "already refunded").
--   * Deleting an unfinished job (directly, or by cascade when its storyboard
--     is deleted) settles its refund in the same transaction, from the job's
--     own counters, via a BEFORE DELETE trigger. No worker ever supplies an
--     amount, and a deletion can no longer lose a refund.
--   * A null claim token never passes the fence.
--
-- Rollout. Old workers wrote the shot and the counter separately, so a job
-- an old worker touches can carry a lagging counter, which the refund here
-- would over-pay. Keep old workers off the queue from apply to deploy:
--   1. pause the cron job:  update cron.job set active = false
--                            where jobname = 'theplus-storyboard-animate';
--   2. wait until  select count(*) from public.storyboard_render_jobs
--                   where status in ('pending', 'processing')  returns 0;
--   3. apply this migration, then deploy the new worker straight away;
--   4. resume the cron job (active = true).
-- Residual: the old app's enqueue action also kicks the worker directly, so
-- a render enqueued between steps 3 and the deploy can run one old-worker
-- tick; it over-refunds only if that tick stalls between its two writes and
-- the job then fails or is deleted.
-- 0035/0036 are taken on feat/finished-shorts; order is independent of both.
-- =============================================================================

-- Posts this job's refund once. Returns the amount on the ledger for the job.
create or replace function public.post_storyboard_render_refund(
  p_workspace_id uuid,
  p_job_id uuid,
  p_amount integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing integer;
  v_balance integer;
begin
  select delta into v_existing
    from public.credit_transactions
   where workspace_id = p_workspace_id
     and reason = 'refund'
     and ref_kind = 'storyboard_render_job'
     and ref_id = p_job_id::text;
  if found then
    return v_existing;
  end if;
  if p_amount is null or p_amount <= 0 then
    return 0;
  end if;

  update public.workspaces
     set credits = credits + p_amount,
         updated_at = now()
   where id = p_workspace_id
  returning credits into v_balance;
  if v_balance is null then
    -- The workspace itself is gone; there is nobody to refund.
    return 0;
  end if;

  insert into public.credit_transactions (
    workspace_id, delta, reason, ref_kind, ref_id, balance_after
  ) values (
    p_workspace_id, p_amount, 'refund', 'storyboard_render_job', p_job_id::text, v_balance
  );
  return p_amount;
end;
$$;

revoke execute on function public.post_storyboard_render_refund(uuid, uuid, integer)
  from public, anon, authenticated, service_role;

drop function if exists public.fail_storyboard_render_job(uuid, text);
drop function if exists public.fail_storyboard_render_job(uuid, timestamptz, text, uuid, integer);

-- Returns the credits refunded for the job, or null when the caller's claim is
-- stale (another worker owns the job now) and nothing was changed.
create or replace function public.fail_storyboard_render_job(
  p_job_id uuid,
  p_claimed_at timestamptz,
  p_error text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.storyboard_render_jobs%rowtype;
  v_refund integer;
begin
  select * into v_job
    from public.storyboard_render_jobs
   where id = p_job_id
     for update;

  if not found then
    -- Deleted (e.g. with its storyboard); the delete trigger already settled
    -- it. Report what is on the ledger for the job.
    return coalesce((
      select delta from public.credit_transactions
       where reason = 'refund'
         and ref_kind = 'storyboard_render_job'
         and ref_id = p_job_id::text
    ), 0);
  end if;
  if v_job.status in ('failed', 'completed') then
    return v_job.cost_refunded;
  end if;
  if p_claimed_at is null or v_job.claimed_at is distinct from p_claimed_at then
    return null;
  end if;

  v_refund := least(
    greatest(0, v_job.shots_total - v_job.shots_completed) * v_job.cost_per_shot,
    v_job.cost_charged_total
  );
  v_refund := public.post_storyboard_render_refund(v_job.workspace_id, p_job_id, v_refund);

  update public.storyboard_render_jobs
     set status = 'failed',
         claimed_at = null,
         last_error = left(p_error, 1000),
         cost_refunded = v_refund,
         completed_at = now(),
         updated_at = now()
   where id = p_job_id;

  return v_refund;
end;
$$;

-- Saves the storyboard's shots and advances the job in one transaction.
-- Returns 'progress', 'completed', 'stale' (claim lost or job finished:
-- nothing written) or 'missing' (job or storyboard gone).
create or replace function public.record_storyboard_render_shot(
  p_job_id uuid,
  p_claimed_at timestamptz,
  p_shots jsonb
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.storyboard_render_jobs%rowtype;
  v_completed integer;
begin
  select * into v_job
    from public.storyboard_render_jobs
   where id = p_job_id
     for update;
  if not found then
    return 'missing';
  end if;
  if v_job.status not in ('pending', 'processing')
     or p_claimed_at is null
     or v_job.claimed_at is distinct from p_claimed_at then
    return 'stale';
  end if;

  update public.storyboards set shots = p_shots where id = v_job.storyboard_id;
  if not found then
    return 'missing';
  end if;

  -- +1 is safe: only the holder of this claim token gets here, and clearing
  -- claimed_at below spends the token.
  v_completed := v_job.shots_completed + 1;
  if v_completed >= v_job.shots_total then
    update public.storyboard_render_jobs
       set shots_completed = v_completed,
           status = 'completed',
           claimed_at = null,
           completed_at = now(),
           updated_at = now()
     where id = p_job_id;
    return 'completed';
  end if;

  update public.storyboard_render_jobs
     set shots_completed = v_completed,
         claimed_at = null,
         updated_at = now()
   where id = p_job_id;
  return 'progress';
end;
$$;

revoke execute on function public.fail_storyboard_render_job(uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.fail_storyboard_render_job(uuid, timestamptz, text)
  to service_role;
revoke execute on function public.record_storyboard_render_shot(uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_storyboard_render_shot(uuid, timestamptz, jsonb)
  to service_role;

-- Deleting an unfinished job settles it in the same transaction. Covers the
-- cascade from a storyboard delete (claimed or not). When the whole workspace
-- is being deleted its row is already gone, so nothing is posted.
create or replace function public.settle_render_job_on_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status in ('pending', 'processing') then
    perform public.post_storyboard_render_refund(
      old.workspace_id,
      old.id,
      least(greatest(0, old.shots_total - old.shots_completed) * old.cost_per_shot,
            old.cost_charged_total)
    );
  end if;
  return old;
end;
$$;

revoke execute on function public.settle_render_job_on_delete() from public, anon, authenticated;

drop trigger if exists settle_render_job_on_delete on public.storyboard_render_jobs;
create trigger settle_render_job_on_delete
  before delete on public.storyboard_render_jobs
  for each row execute function public.settle_render_job_on_delete();
