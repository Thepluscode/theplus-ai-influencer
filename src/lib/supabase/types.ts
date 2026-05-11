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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_user_id: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_user_id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
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
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export type WorkspaceRow = Database['public']['Tables']['workspaces']['Row'];
export type AiModelRow = Database['public']['Tables']['ai_models']['Row'];
export type PostRow = Database['public']['Tables']['posts']['Row'];
