-- =============================================================================
-- 0037 — Fail a storyboard render job and refund it in ONE transaction.
--
-- The animate worker used to do two separate writes: mark the job failed with
-- cost_refunded, then call grant_credits. If the grant failed (or the worker
-- died between them) the job sat at status=failed with cost_refunded > 0 and
-- no credit ever posted, and a failed job is never claimed again: the refund
-- was stranded. It also computed the refund from shots_completed, which lags
-- when a shot's video was saved but the progress write failed, so a later
-- failure refunded a shot the user had already received.
-- Both reproduced against the worker (Codex review task-mwvzeif8-pa30zn).
--
-- fail_storyboard_render_job(job, error):
--   * locks the job row; a job already failed/completed returns its recorded
--     refund and changes nothing (safe to call again after a lost response);
--   * refunds only shots that still have no video in the storyboard, capped
--     by the job's own shots_total - shots_completed and by what was charged;
--   * posts the refund through grant_credits under (storyboard_render_job,
--     job id), whose unique index makes a repeat a no-op;
--   * marks the job failed in the same transaction. If any step raises,
--     nothing is written and the job stays claimable for the stalled sweep.
--
-- Note: 0035/0036 are taken on feat/finished-shorts; this number avoids a
-- collision when the branches meet. Order is independent of both.
-- =============================================================================

create or replace function public.fail_storyboard_render_job(p_job_id uuid, p_error text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.storyboard_render_jobs%rowtype;
  v_shots jsonb;
  v_unproduced integer;
  v_refund integer;
begin
  select * into v_job
    from public.storyboard_render_jobs
   where id = p_job_id
     for update;
  if not found then
    raise exception 'render job % not found', p_job_id using errcode = 'P0002';
  end if;
  if v_job.status in ('failed', 'completed') then
    return v_job.cost_refunded;
  end if;

  select shots into v_shots from public.storyboards where id = v_job.storyboard_id;
  if v_shots is null or jsonb_typeof(v_shots) <> 'array' then
    -- No storyboard to inspect: fall back to the job's own count.
    v_unproduced := v_job.shots_total - v_job.shots_completed;
  else
    select count(*) into v_unproduced
      from jsonb_array_elements(v_shots) as shot
     where coalesce(shot ->> 'videoUrl', '') = '';
  end if;

  v_refund := least(
    greatest(0, least(v_unproduced, v_job.shots_total - v_job.shots_completed))
      * v_job.cost_per_shot,
    v_job.cost_charged_total
  );

  if v_refund > 0 then
    perform public.grant_credits(
      v_job.workspace_id, v_refund, 'refund', 'storyboard_render_job', p_job_id::text
    );
  end if;

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

revoke execute on function public.fail_storyboard_render_job(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_storyboard_render_job(uuid, text) to service_role;
