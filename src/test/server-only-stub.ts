// Vitest stub for the `server-only` package. The real module throws when
// imported in a non-RSC context — that's exactly what we want to *avoid* in
// unit tests of pure functions that happen to live in server-only files.
export {};
