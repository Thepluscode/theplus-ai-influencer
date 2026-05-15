/**
 * Hand-written Supabase Database type. Mirrors supabase/migrations/0001_initial_schema.sql.
 *
 * When the schema grows, switch to `supabase gen types typescript --local > types.ts`
 * (requires the Supabase CLI). For now this is small enough to keep in sync by hand.
 */

import type { InfluencerWizardInput } from '@/types/influencer';
import type { PostBriefInput, PostVariant } from '@/types/post';

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string;
          owner_user_id: string;
          name: string;
          credits: number;
          plan: 'free' | 'pro' | 'studio' | 'agency';
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          plan_renews_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_user_id: string;
          name: string;
          credits?: number;
          plan?: 'free' | 'pro' | 'studio' | 'agency';
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          plan_renews_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_user_id?: string;
          name?: string;
          credits?: number;
          plan?: 'free' | 'pro' | 'studio' | 'agency';
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          plan_renews_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      workspace_brand_defaults: {
        Row: {
          workspace_id: string;
          brand_tone: 'professional' | 'casual' | 'playful' | 'luxe' | 'edgy';
          brand_vibe: string;
          brand_palette: string;
          default_cta: 'shop_now' | 'learn_more' | 'sign_up' | 'swipe_up' | 'dm_me' | 'no_cta';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          workspace_id: string;
          brand_tone?: 'professional' | 'casual' | 'playful' | 'luxe' | 'edgy';
          brand_vibe?: string;
          brand_palette?: string;
          default_cta?: 'shop_now' | 'learn_more' | 'sign_up' | 'swipe_up' | 'dm_me' | 'no_cta';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          workspace_id?: string;
          brand_tone?: 'professional' | 'casual' | 'playful' | 'luxe' | 'edgy';
          brand_vibe?: string;
          brand_palette?: string;
          default_cta?: 'shop_now' | 'learn_more' | 'sign_up' | 'swipe_up' | 'dm_me' | 'no_cta';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_brand_defaults_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_invites: {
        Row: {
          id: string;
          workspace_id: string;
          email: string;
          role: 'viewer' | 'editor' | 'admin';
          status: 'pending' | 'accepted' | 'revoked';
          invited_by_user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          email: string;
          role?: 'viewer' | 'editor' | 'admin';
          status?: 'pending' | 'accepted' | 'revoked';
          invited_by_user_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          email?: string;
          role?: 'viewer' | 'editor' | 'admin';
          status?: 'pending' | 'accepted' | 'revoked';
          invited_by_user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_invites_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_webhooks: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          url: string;
          events: Array<
            'post.scheduled' | 'post.published' | 'review.approved' | 'comment.created'
          >;
          active: boolean;
          last_delivery_at: string | null;
          last_delivery_status: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          url: string;
          events?: Array<
            'post.scheduled' | 'post.published' | 'review.approved' | 'comment.created'
          >;
          active?: boolean;
          last_delivery_at?: string | null;
          last_delivery_status?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          name?: string;
          url?: string;
          events?: Array<
            'post.scheduled' | 'post.published' | 'review.approved' | 'comment.created'
          >;
          active?: boolean;
          last_delivery_at?: string | null;
          last_delivery_status?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_webhooks_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_models: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          wizard_input: InfluencerWizardInput;
          portrait_url: string;
          full_body_url: string;
          portrait_generation_id: string | null;
          full_body_generation_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          wizard_input: InfluencerWizardInput;
          portrait_url: string;
          full_body_url: string;
          portrait_generation_id?: string | null;
          full_body_generation_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          name?: string;
          wizard_input?: InfluencerWizardInput;
          portrait_url?: string;
          full_body_url?: string;
          portrait_generation_id?: string | null;
          full_body_generation_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_models_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      content_plans: {
        Row: {
          id: string;
          workspace_id: string;
          model_id: string | null;
          name: string;
          goal: 'awareness' | 'engagement' | 'launch' | 'sales' | 'community';
          duration_days: number;
          cadence_per_week: number;
          start_date: string;
          seed_inputs: unknown;
          items: unknown;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          model_id?: string | null;
          name: string;
          goal: 'awareness' | 'engagement' | 'launch' | 'sales' | 'community';
          duration_days: number;
          cadence_per_week: number;
          start_date?: string;
          seed_inputs: unknown;
          items?: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          model_id?: string | null;
          name?: string;
          goal?: 'awareness' | 'engagement' | 'launch' | 'sales' | 'community';
          duration_days?: number;
          cadence_per_week?: number;
          start_date?: string;
          seed_inputs?: unknown;
          items?: unknown;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'content_plans_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'content_plans_model_id_fkey';
            columns: ['model_id'];
            referencedRelation: 'ai_models';
            referencedColumns: ['id'];
          },
        ];
      };
      comments: {
        Row: {
          id: string;
          workspace_id: string;
          post_id: string | null;
          platform: string;
          author_handle: string;
          author_avatar: string | null;
          comment_text: string;
          status: 'pending' | 'replied' | 'dismissed' | 'hidden';
          draft_reply: string | null;
          classification: 'fan' | 'question' | 'troll' | 'spam' | 'collab' | 'unknown' | null;
          external_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          post_id?: string | null;
          platform: string;
          author_handle: string;
          author_avatar?: string | null;
          comment_text: string;
          status?: 'pending' | 'replied' | 'dismissed' | 'hidden';
          draft_reply?: string | null;
          classification?: 'fan' | 'question' | 'troll' | 'spam' | 'collab' | 'unknown' | null;
          external_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          post_id?: string | null;
          platform?: string;
          author_handle?: string;
          author_avatar?: string | null;
          comment_text?: string;
          status?: 'pending' | 'replied' | 'dismissed' | 'hidden';
          draft_reply?: string | null;
          classification?: 'fan' | 'question' | 'troll' | 'spam' | 'collab' | 'unknown' | null;
          external_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      dm_threads: {
        Row: {
          id: string;
          workspace_id: string;
          platform: string;
          author_handle: string;
          author_avatar: string | null;
          last_message: string;
          classification: 'collab' | 'lead' | 'fan' | 'support' | 'spam' | 'other';
          summary: string | null;
          suggested_reply: string | null;
          status: 'pending' | 'replied' | 'archived' | 'snoozed';
          external_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          platform: string;
          author_handle: string;
          author_avatar?: string | null;
          last_message: string;
          classification: 'collab' | 'lead' | 'fan' | 'support' | 'spam' | 'other';
          summary?: string | null;
          suggested_reply?: string | null;
          status?: 'pending' | 'replied' | 'archived' | 'snoozed';
          external_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          platform?: string;
          author_handle?: string;
          author_avatar?: string | null;
          last_message?: string;
          classification?: 'collab' | 'lead' | 'fan' | 'support' | 'spam' | 'other';
          summary?: string | null;
          suggested_reply?: string | null;
          status?: 'pending' | 'replied' | 'archived' | 'snoozed';
          external_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      safety_audits: {
        Row: {
          id: string;
          workspace_id: string;
          post_id: string | null;
          caption: string;
          image_url: string | null;
          verdict: 'pass' | 'warn' | 'block';
          issues: unknown;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          post_id?: string | null;
          caption: string;
          image_url?: string | null;
          verdict: 'pass' | 'warn' | 'block';
          issues?: unknown;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          post_id?: string | null;
          caption?: string;
          image_url?: string | null;
          verdict?: 'pass' | 'warn' | 'block';
          issues?: unknown;
          created_at?: string;
        };
        Relationships: [];
      };
      storyboards: {
        Row: {
          id: string;
          workspace_id: string;
          model_id: string | null;
          name: string;
          brief: string;
          format: 'square' | 'portrait' | 'landscape';
          summary: string | null;
          shots: unknown;
          review_status: 'needs_changes' | 'approved' | 'final';
          review_version: number;
          approved_at: string | null;
          finalized_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          model_id?: string | null;
          name: string;
          brief: string;
          format: 'square' | 'portrait' | 'landscape';
          summary?: string | null;
          shots?: unknown;
          review_status?: 'needs_changes' | 'approved' | 'final';
          review_version?: number;
          approved_at?: string | null;
          finalized_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          model_id?: string | null;
          name?: string;
          brief?: string;
          format?: 'square' | 'portrait' | 'landscape';
          summary?: string | null;
          shots?: unknown;
          review_status?: 'needs_changes' | 'approved' | 'final';
          review_version?: number;
          approved_at?: string | null;
          finalized_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'storyboards_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'storyboards_model_id_fkey';
            columns: ['model_id'];
            referencedRelation: 'ai_models';
            referencedColumns: ['id'];
          },
        ];
      };
      posts: {
        Row: {
          id: string;
          workspace_id: string;
          model_id: string | null;
          name: string;
          status: 'draft' | 'scheduled' | 'published';
          platforms: string[];
          format: 'square' | 'portrait' | 'landscape';
          prompt_inputs: PostBriefInput;
          variants: PostVariant[];
          caption: string | null;
          scheduled_for: string | null;
          zernio_post_id: string | null;
          share_token: string | null;
          review_status: 'needs_changes' | 'approved' | 'final';
          review_version: number;
          approved_at: string | null;
          finalized_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          model_id?: string | null;
          name: string;
          status?: 'draft' | 'scheduled' | 'published';
          platforms?: string[];
          format: 'square' | 'portrait' | 'landscape';
          prompt_inputs: PostBriefInput;
          variants?: PostVariant[];
          caption?: string | null;
          scheduled_for?: string | null;
          zernio_post_id?: string | null;
          share_token?: string | null;
          review_status?: 'needs_changes' | 'approved' | 'final';
          review_version?: number;
          approved_at?: string | null;
          finalized_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          model_id?: string | null;
          name?: string;
          status?: 'draft' | 'scheduled' | 'published';
          platforms?: string[];
          format?: 'square' | 'portrait' | 'landscape';
          prompt_inputs?: PostBriefInput;
          variants?: PostVariant[];
          caption?: string | null;
          scheduled_for?: string | null;
          zernio_post_id?: string | null;
          share_token?: string | null;
          review_status?: 'needs_changes' | 'approved' | 'final';
          review_version?: number;
          approved_at?: string | null;
          finalized_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'posts_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'posts_model_id_fkey';
            columns: ['model_id'];
            referencedRelation: 'ai_models';
            referencedColumns: ['id'];
          },
        ];
      };
      review_comments: {
        Row: {
          id: string;
          workspace_id: string;
          subject_type: 'post' | 'storyboard';
          post_id: string | null;
          storyboard_id: string | null;
          author_name: string;
          author_email: string | null;
          body: string;
          status: 'open' | 'resolved';
          shot_index: number | null;
          variant_index: number | null;
          time_ms: number;
          anchor_x: number;
          anchor_y: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          subject_type: 'post' | 'storyboard';
          post_id?: string | null;
          storyboard_id?: string | null;
          author_name: string;
          author_email?: string | null;
          body: string;
          status?: 'open' | 'resolved';
          shot_index?: number | null;
          variant_index?: number | null;
          time_ms?: number;
          anchor_x?: number;
          anchor_y?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          subject_type?: 'post' | 'storyboard';
          post_id?: string | null;
          storyboard_id?: string | null;
          author_name?: string;
          author_email?: string | null;
          body?: string;
          status?: 'open' | 'resolved';
          shot_index?: number | null;
          variant_index?: number | null;
          time_ms?: number;
          anchor_x?: number;
          anchor_y?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'review_comments_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'review_comments_post_id_fkey';
            columns: ['post_id'];
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'review_comments_storyboard_id_fkey';
            columns: ['storyboard_id'];
            referencedRelation: 'storyboards';
            referencedColumns: ['id'];
          },
        ];
      };
      review_decisions: {
        Row: {
          id: string;
          workspace_id: string;
          subject_type: 'post' | 'storyboard';
          post_id: string | null;
          storyboard_id: string | null;
          version_number: number;
          decision: 'needs_changes' | 'approved' | 'final';
          reviewer_name: string;
          reviewer_email: string | null;
          summary: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          subject_type: 'post' | 'storyboard';
          post_id?: string | null;
          storyboard_id?: string | null;
          version_number: number;
          decision: 'needs_changes' | 'approved' | 'final';
          reviewer_name: string;
          reviewer_email?: string | null;
          summary: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          subject_type?: 'post' | 'storyboard';
          post_id?: string | null;
          storyboard_id?: string | null;
          version_number?: number;
          decision?: 'needs_changes' | 'approved' | 'final';
          reviewer_name?: string;
          reviewer_email?: string | null;
          summary?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'review_decisions_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'review_decisions_post_id_fkey';
            columns: ['post_id'];
            referencedRelation: 'posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'review_decisions_storyboard_id_fkey';
            columns: ['storyboard_id'];
            referencedRelation: 'storyboards';
            referencedColumns: ['id'];
          },
        ];
      };
      storyboard_render_jobs: {
        Row: {
          id: string;
          workspace_id: string;
          storyboard_id: string;
          status: 'pending' | 'processing' | 'completed' | 'failed';
          shots_total: number;
          shots_completed: number;
          cost_charged_total: number;
          cost_per_shot: number;
          cost_refunded: number;
          last_error: string | null;
          attempts: number;
          claimed_at: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          storyboard_id: string;
          status?: 'pending' | 'processing' | 'completed' | 'failed';
          shots_total: number;
          shots_completed?: number;
          cost_charged_total: number;
          cost_per_shot: number;
          cost_refunded?: number;
          last_error?: string | null;
          attempts?: number;
          claimed_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          storyboard_id?: string;
          status?: 'pending' | 'processing' | 'completed' | 'failed';
          shots_total?: number;
          shots_completed?: number;
          cost_charged_total?: number;
          cost_per_shot?: number;
          cost_refunded?: number;
          last_error?: string | null;
          attempts?: number;
          claimed_at?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'storyboard_render_jobs_workspace_id_fkey';
            columns: ['workspace_id'];
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'storyboard_render_jobs_storyboard_id_fkey';
            columns: ['storyboard_id'];
            referencedRelation: 'storyboards';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      record_post_review_decision: {
        Args: {
          p_workspace_id: string;
          p_post_id: string;
          p_decision: 'needs_changes' | 'approved' | 'final';
          p_reviewer_name: string;
          p_reviewer_email: string | null;
          p_summary: string;
        };
        Returns: Database['public']['Tables']['review_decisions']['Row'];
      };
      record_storyboard_review_decision: {
        Args: {
          p_workspace_id: string;
          p_storyboard_id: string;
          p_decision: 'needs_changes' | 'approved' | 'final';
          p_reviewer_name: string;
          p_reviewer_email: string | null;
          p_summary: string;
        };
        Returns: Database['public']['Tables']['review_decisions']['Row'];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type WorkspaceRow = Database['public']['Tables']['workspaces']['Row'];
export type WorkspaceBrandDefaultsRow =
  Database['public']['Tables']['workspace_brand_defaults']['Row'];
export type WorkspaceInviteRow = Database['public']['Tables']['workspace_invites']['Row'];
export type WorkspaceWebhookRow = Database['public']['Tables']['workspace_webhooks']['Row'];
export type AiModelRow = Database['public']['Tables']['ai_models']['Row'];
export type PostRow = Database['public']['Tables']['posts']['Row'];
export type ContentPlanRow = Database['public']['Tables']['content_plans']['Row'];
export type StoryboardRow = Database['public']['Tables']['storyboards']['Row'];
export type CommentRow = Database['public']['Tables']['comments']['Row'];
export type ReviewCommentRow = Database['public']['Tables']['review_comments']['Row'];
export type ReviewDecisionRow = Database['public']['Tables']['review_decisions']['Row'];
export type DmThreadRow = Database['public']['Tables']['dm_threads']['Row'];
export type SafetyAuditRow = Database['public']['Tables']['safety_audits']['Row'];
export type StoryboardRenderJobRow = Database['public']['Tables']['storyboard_render_jobs']['Row'];
