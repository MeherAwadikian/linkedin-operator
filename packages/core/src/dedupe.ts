/**
 * Canonical dedupe key: normalized company + title (spec §13), ported from the
 * original `src/applications/dedupe.js`. The same posting is often mirrored
 * across sources with different casing/whitespace; this collapses them.
 *
 * In the new app this becomes the `postings.dedupe_hash` value.
 */
export function dedupeKey(job: { company?: string; title?: string }): string {
  const norm = (s: string | undefined): string =>
    (s ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${norm(job.company)}::${norm(job.title)}`;
}
