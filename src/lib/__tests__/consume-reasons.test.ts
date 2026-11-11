// Migration 0034 makes consume_credits refuse any reason outside its spend list.
// A caller passing anything else would fail only at runtime, so pin it here:
// every consumeCredits(...) call in src must use a literal reason from that list.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../../..');
const migration = readFileSync(
  path.join(root, 'supabase/migrations/0034_consume_credits_spend_reasons.sql'),
  'utf8',
);
const spendList = migration.slice(migration.indexOf('not in ('), migration.indexOf(') then'));
const allowed = new Set([...spendList.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : sources(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('consumeCredits callers vs 0034', () => {
  it('the migration lists exactly the 14 spend reasons and no grant-type reason', () => {
    expect(allowed.size).toBe(14);
    for (const grant of [
      'refund',
      'topup',
      'plan_upgrade',
      'admin_adjustment',
      'initial_grant',
      'monthly_grant',
    ]) {
      expect(allowed.has(grant), grant).toBe(false);
    }
  });

  it('every call passes a literal spend reason', () => {
    const calls: { file: string; reasons: string[] }[] = [];
    for (const file of sources(path.join(root, 'src'))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\bconsumeCredits\(\{([\s\S]*?)\}\)/g)) {
        // `reason: 'x'` is checked directly. `reason: name` or the `reason,`
        // shorthand must resolve through `const <name>... = ...;` in the same
        // file, and EVERY literal on that declaration must be a spend reason.
        // Anything else resolves to [] and fails (Codex re-review, 2026-11-11).
        const literal = /\breason:\s*'([a-z_]+)'/.exec(m[1])?.[1];
        const name = literal
          ? null
          : (/\breason:\s*([A-Za-z_$][\w$]*)/.exec(m[1])?.[1] ??
            (/(^|[\s,{])reason\s*(,|$)/m.test(m[1]) ? 'reason' : null));
        const decl = name ? new RegExp(`const ${name}\\b[^=]*=([^;]+);`).exec(src)?.[1] : undefined;
        const reasons = literal
          ? [literal]
          : decl
            ? [...decl.matchAll(/'([a-z_]+)'/g)].map((r) => r[1])
            : [];
        calls.push({ file: path.relative(root, file), reasons });
      }
    }
    expect(calls.length).toBeGreaterThanOrEqual(15); // 2026-11-11: 15 call sites
    for (const c of calls) {
      expect(
        c.reasons.length,
        `${c.file}: reason could not be resolved to literals`,
      ).toBeGreaterThan(0);
      for (const r of c.reasons) expect(allowed.has(r), `${c.file}: ${r}`).toBe(true);
    }
  });
});
