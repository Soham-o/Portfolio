// Chooses the one-paragraph summary shown on project cards and in page metadata.
// Order (first usable wins): your override → a meaningful GitHub description → a README summary
// (see extractSummary in readme.mjs) → an explicit "no description" fallback. Never generated text.

const FILLER = new Set([
  'project', 'projects', 'repo', 'repository', 'my', 'a', 'an', 'the', 'of', 'for', 'and', 'in', 'on', 'with',
  'app', 'code', 'files', 'source', 'test', 'demo', 'mini', 'simple', 'basic', 'sample', 'new', 'first',
]);

/** A description says something beyond the repo's own name ("Project Employee Analysis" does not). */
export function isMeaningfulDescription(description, name = '') {
  const text = String(description || '').trim();
  if (!text) return false;
  const nameWords = new Set(String(name).toLowerCase().split(/[\s_\-.]+|(?<=[a-z])(?=[A-Z])/).filter(Boolean));
  for (const w of String(name).split(/(?<=[a-z])(?=[A-Z])/)) nameWords.add(w.toLowerCase());
  const informative = (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [])
    .map((w) => w.toLowerCase())
    .filter((w) => !FILLER.has(w) && !nameWords.has(w));
  return informative.length >= 3;
}

export const NO_DESCRIPTION = {
  card: 'No description yet — the repository has no description or README summary.',
  readmeOnly: 'No summary yet — see the README below for details.',
};

/**
 * @returns {{ text: string, source: 'override'|'description'|'readme'|'none' }}
 */
export function chooseSummary({ override = {}, description = '', name = '', readme = null }) {
  if (override.summary && String(override.summary).trim()) return { text: String(override.summary).trim(), source: 'override' };
  if (isMeaningfulDescription(description, name)) return { text: String(description).replace(/\s+/g, ' ').trim(), source: 'description' };
  if (readme?.summary) return { text: readme.summary, source: 'readme' };
  return { text: readme ? NO_DESCRIPTION.readmeOnly : NO_DESCRIPTION.card, source: 'none' };
}
