with storyboard_state as (
  select
    review_status,
    jsonb_typeof(shots) = 'array'
      and jsonb_array_length(shots) > 0
      and not exists (
        select 1
        from jsonb_array_elements(shots) shot
        where nullif(trim(shot->>'videoUrl'), '') is null
      ) as fully_animated
  from public.storyboards
)
select
  count(*) as storyboard_count,
  count(*) filter (
    where review_status in ('approved', 'final') and fully_animated
  ) as export_ready_storyboard_count,
  (select count(*) from public.storyboard_export_jobs) as export_job_count,
  (select count(*) from public.storyboard_export_jobs where status in ('queued', 'rendering'))
    as active_export_job_count
from storyboard_state;
