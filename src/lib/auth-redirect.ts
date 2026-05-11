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
  if (CONTROL_CHAR.test(input)) return null;
  return input;
}
