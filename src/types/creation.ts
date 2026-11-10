import { z } from 'zod';

export const CREATE_MODES = ['picture', 'edit'] as const;
export type CreateMode = (typeof CREATE_MODES)[number];

/** Luma photon aspect ratios offered on Create (a subset of what the SDK accepts). */
export const CREATE_ASPECTS = ['3:4', '1:1', '4:3', '9:16', '16:9'] as const;
export type CreateAspect = (typeof CREATE_ASPECTS)[number];

export const CreateInput = z
  .object({
    mode: z.enum(CREATE_MODES),
    prompt: z.string().trim().min(1, 'Describe what you want.').max(2000),
    aspect: z.enum(CREATE_ASPECTS).default('3:4'),
    // Edit only. An id the server looks up in the caller's workspace — never a URL.
    sourceCreationId: z.string().uuid().optional(),
  })
  .refine((v) => v.mode !== 'edit' || Boolean(v.sourceCreationId), {
    message: 'Pick a result to edit.',
    path: ['sourceCreationId'],
  });

export type CreateInput = z.infer<typeof CreateInput>;

export interface CreationView {
  id: string;
  mode: CreateMode;
  prompt: string;
  personaName: string | null;
  aspect: CreateAspect;
  assetUrl: string;
  creditsSpent: number;
  createdAt: string;
  /** False when the asset was rendered but the record could not be written. */
  saved: boolean;
}
