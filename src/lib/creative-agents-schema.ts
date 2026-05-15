import { z } from 'zod';

export const CreativeAgentBrandDefaultsSchema = z.object({
  brandTone: z.string().min(1).max(80),
  brandVibe: z.string().max(240),
  brandPalette: z.string().max(240),
  defaultCta: z.string().min(1).max(80),
});

export const CreativeAgentShotSchema = z.object({
  index: z.number().int().min(1).max(12),
  title: z.string().min(1).max(120),
  frame: z.string().min(1).max(500),
  camera: z.string().min(1).max(240),
  prompt: z.string().min(1).max(900),
  audio: z.string().min(1).max(240),
  qualityGate: z.string().min(1).max(240),
});

export const CreativeAgentReviewIssueSchema = z.object({
  id: z.string().min(1).max(80),
  severity: z.enum(['fixing', 'clear']),
  asset: z.string().min(1).max(180),
  label: z.string().min(1).max(180),
  before: z.string().min(1).max(700),
  fix: z.string().min(1).max(700),
});

export const CreativeAgentRunPayloadSchema = z.object({
  prompt: z.string().min(1).max(2000),
  brandDefaults: CreativeAgentBrandDefaultsSchema,
  run: z.object({
    campaignTitle: z.string().min(1).max(180),
    conceptLine: z.string().min(1).max(500),
    script: z.array(z.string().min(1).max(700)).min(1).max(12),
    voiceover: z.array(z.string().min(1).max(300)).max(12),
    musicCue: z.string().min(1).max(500),
    soundDesign: z.array(z.string().min(1).max(300)).max(12),
    brandIdentity: z.array(z.string().min(1).max(300)).max(12),
    shots: z.array(CreativeAgentShotSchema).min(3).max(6),
    reviewIssues: z.array(CreativeAgentReviewIssueSchema).max(12),
    composeNotes: z.array(z.string().min(1).max(300)).max(12),
    assetCount: z.number().int().min(0).max(500),
  }),
  fixedIssueIds: z.array(z.string().min(1).max(80)).max(50).default([]),
});

export type CreativeAgentBrandDefaults = z.infer<typeof CreativeAgentBrandDefaultsSchema>;
export type CreativeAgentShot = z.infer<typeof CreativeAgentShotSchema>;
export type CreativeAgentReviewIssue = z.infer<typeof CreativeAgentReviewIssueSchema>;
export type CreativeAgentRunPayload = z.infer<typeof CreativeAgentRunPayloadSchema>;
