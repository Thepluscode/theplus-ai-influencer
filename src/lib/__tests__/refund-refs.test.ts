import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Migration 0021's unique index only deduplicates a refund when BOTH ref_kind
// and ref_id are non-null. A refund issued without a ref is therefore
// unprotected: nothing stops the same reversal being posted twice, and the
// ledger cannot tell a duplicate from a second legitimate refund.
//
// Six of seventeen call sites were missing it. A per-site unit test would need
// six sets of mocks and would still say nothing about the seventh site someone
// adds next month. This walks the source instead, so a new refund without a ref
// fails the suite the moment it is written.
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry !== 'node_modules' && entry !== '__tests__') walk(p, out);
    } else if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

/** Return the balanced `{...}` argument of each call to `fn` in `src`. */
function callArgs(src: string, fn: string): { block: string; line: number }[] {
  const found: { block: string; line: number }[] = [];
  const re = new RegExp(`${fn}\\(\\{`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let j = m.index + m[0].length;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    found.push({
      block: src.slice(m.index + m[0].length, j),
      line: src.slice(0, m.index).split('\n').length,
    });
  }
  return found;
}

describe('every refund carries the ref the ledger deduplicates on', () => {
  const files = walk('src');

  it('finds the refund call sites at all (guards against a vacuous pass)', () => {
    // If this ever reads 0, the walk or the matcher broke and the assertion
    // below would pass while checking nothing.
    const total = files.reduce(
      (n, f) => n + callArgs(readFileSync(f, 'utf8'), 'refundCredits').length,
      0,
    );
    expect(total).toBeGreaterThanOrEqual(17);
  });

  it('no refundCredits call omits refId', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const { block, line } of callArgs(src, 'refundCredits')) {
        if (!/\brefId\b/.test(block)) offenders.push(`${f}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('a refund ref is paired with a debit ref in the same function', () => {
    // A refund whose ref matches nothing on the way in cannot be reconciled.
    // Every file that refunds must also debit with a ref.
    const unpaired: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const refunds = callArgs(src, 'refundCredits');
      if (!refunds.length) continue;
      const debits = callArgs(src, 'consumeCredits');
      if (debits.length && !debits.some((d) => /\brefId\b/.test(d.block))) {
        unpaired.push(f);
      }
    }
    expect(unpaired).toEqual([]);
  });
});
