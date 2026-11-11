/**
 * Sanitize a returnTo target so an attacker can't bounce a freshly-authenticated
 * user off-site or onto a `javascript:` URL. Only same-origin pathnames are allowed.
 */

// Match any ASCII control char (newlines, NUL, etc.). Built via constructor
// + escape sequences so the source file stays plain text.
const CONTROL_CHAR = new RegExp('[\\u0000-\\u001f\\u007f]');

export function sanitizeReturnTo(
  input: FormDataEntryValue | string | null | undefined,
): string | null {
  if (typeof input !== 'string' || input.length === 0) return null;
  // Must start with `/` and not `//` (which would be a protocol-relative URL).
  if (!input.startsWith('/') || input.startsWith('//')) return null;
  // Browsers parse `\` as `/`, so `/\evil.example` is protocol-relative too.
  if (input.includes('\\') || CONTROL_CHAR.test(input)) return null;
  // Belt and braces: whatever survives must still resolve to our own origin.
  const probe = 'https://same-origin.invalid';
  if (new URL(input, probe).origin !== probe) return null;
  return input;
}

/** Where a fresh session lands when no explicit `next` was asked for. */
export function landingAfterAuth(
  user: { created_at?: string; last_sign_in_at?: string } | null,
): string {
  return user && isFirstSignIn(user) ? '/welcome' : '/dashboard';
}

// ponytail: GoTrue stamps created_at and last_sign_in_at together on a user's
// first OAuth sign-in; a returning user's created_at is older. A user who signs
// in twice inside the window sees /welcome again, which is harmless. Store an
// "onboarded" flag if that ever matters.
const FIRST_SIGN_IN_WINDOW_MS = 60_000;

function isFirstSignIn(user: { created_at?: string; last_sign_in_at?: string }): boolean {
  const created = Date.parse(user.created_at ?? '');
  const signedIn = Date.parse(user.last_sign_in_at ?? '');
  if (Number.isNaN(created) || Number.isNaN(signedIn)) return false;
  return Math.abs(signedIn - created) < FIRST_SIGN_IN_WINDOW_MS;
}
