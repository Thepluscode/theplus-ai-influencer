-- =============================================================================
-- 0010_storyboard_video.sql
-- =============================================================================
-- Extends credit_transactions.reason to accept the new
-- 'storyboard_video_render' cost code for Luma Dream Machine
-- animate-to-video renders.
-- =============================================================================

alter table public.credit_transactions
  drop constraint if exists credit_transactions_reason_check;

alter table public.credit_transactions
  add constraint credit_transactions_reason_check
  check (reason in (
    'initial_grant',
    'monthly_grant',
    'topup',
    'plan_upgrade',
    'influencer_render',
    'post_variant_render',
    'caption_generation',
    'series_plan_generation',
    'storyboard_generation',
    'storyboard_shot_render',
    'storyboard_video_render',
    'brand_safety_check',
    'comment_reply_draft',
    'dm_triage',
    'refund',
    'admin_adjustment'
  ));
