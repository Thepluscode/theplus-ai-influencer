'use server';

import { createContentSourceFromInput, type CreateSourceState } from '@/lib/content-source-create';
import type { CreateContentSourceInput } from '@/lib/content-sources-schema';

export type { CreateSourceState };

export async function createContentSourceAction(
  input: CreateContentSourceInput,
): Promise<CreateSourceState> {
  return createContentSourceFromInput(input);
}
