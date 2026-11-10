// @handle mentions: a persona is summoned in any prompt by typing @ plus its
// handle ("@aria-vance on a rooftop at golden hour"). Pure and client-safe —
// the Create form uses it for autocomplete, the server uses it to decide which
// persona's portrait locks the face. The server's resolution is the one that
// counts; the client's is a typing aid.
//
// ponytail: the handle is derived from the persona's name rather than stored,
// so no migration is needed. Two personas whose names slug the same are
// reported as ambiguous instead of guessed; store a unique handle column when
// operators start hitting that.

export const MAX_HANDLE_LENGTH = 63;

/** "Aria Vance" → "aria-vance". Empty when the name has no ASCII letters or digits. */
export function personaHandle(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_HANDLE_LENGTH)
    .replace(/-+$/, '');
}

// "@" must start the text or follow a character that cannot end a word, so
// email addresses (ana@example.com, ana_b@example.com) and "@@x" are not
// mentions, while "rooftop.@aria" still is. A trailing hyphen is punctuation
// ("@aria-, then…"), not part of the handle.
const MENTION = /(^|[^A-Za-z0-9_@])@([A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)/g;

/** Distinct lowercased handles in the order they first appear. */
export function extractMentions(prompt: string): string[] {
  const seen = new Set<string>();
  for (const m of prompt.matchAll(MENTION)) {
    seen.add(m[2].toLowerCase());
  }
  return [...seen];
}

export interface HandleCandidate {
  id: string;
  name: string;
}

export type MentionResolution<T extends HandleCandidate> =
  | { ok: true; persona: T | null }
  | { ok: false; reason: 'unknown'; handles: string[] }
  | { ok: false; reason: 'ambiguous'; handles: string[] }
  | { ok: false; reason: 'too_many'; handles: string[] };

/**
 * Resolves the mentions in a prompt against the workspace's personas.
 * At most one persona per generation, because Luma's character_ref locks a
 * single identity (identity0). No mention → `persona: null`, a render with no
 * face lock. An unknown handle is an error, never a silent unlocked render.
 */
export function resolveMention<T extends HandleCandidate>(
  prompt: string,
  personas: readonly T[],
): MentionResolution<T> {
  const handles = extractMentions(prompt);
  if (handles.length === 0) return { ok: true, persona: null };

  const byHandle = new Map<string, T[]>();
  for (const p of personas) {
    const h = personaHandle(p.name);
    if (!h) continue;
    byHandle.set(h, [...(byHandle.get(h) ?? []), p]);
  }

  const unknown = handles.filter((h) => !byHandle.has(h));
  if (unknown.length) return { ok: false, reason: 'unknown', handles: unknown };

  const ambiguous = handles.filter((h) => (byHandle.get(h)?.length ?? 0) > 1);
  if (ambiguous.length) return { ok: false, reason: 'ambiguous', handles: ambiguous };

  if (handles.length > 1) return { ok: false, reason: 'too_many', handles };

  return { ok: true, persona: byHandle.get(handles[0])![0] };
}

/**
 * Replaces each mention with a neutral reference to the locked identity, so
 * the image model never sees a handle as literal text to render.
 */
export function replaceMentions(
  prompt: string,
  replacement = 'the person from the reference',
): string {
  return prompt.replace(MENTION, (_all, lead: string) => `${lead}${replacement}`);
}

/** Error copy for a failed resolution. Shared by the form and the server action. */
export function mentionErrorMessage(
  r: Exclude<MentionResolution<HandleCandidate>, { ok: true }>,
): string {
  const list = r.handles.map((h) => `@${h}`).join(', ');
  switch (r.reason) {
    case 'unknown':
      return `No persona in this workspace answers to ${list}.`;
    case 'ambiguous':
      return `${list} matches more than one persona. Rename one of them so each handle is unique.`;
    case 'too_many':
      return `Mention one persona per picture (found ${list}). The face lock holds a single identity.`;
  }
}
