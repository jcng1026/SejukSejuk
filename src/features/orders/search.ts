/**
 * Keeps only characters that are safe inside a PostgREST `or=(...)` filter.
 * Commas, parentheses, dots-with-operators, quotes and `*` would let a search
 * box inject extra filter clauses, so they are stripped.
 */
export function sanitizeSearch(q: string): string {
  return q
    .replace(/[^\p{L}\p{N}\s@-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
}

/** Digits a phone search should match against stored 60XXXXXXXXX numbers. */
export function phoneDigits(q: string): string {
  return q.replace(/\D/g, "").replace(/^(60|0)/, "");
}
