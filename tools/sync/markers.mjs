// In-place replacement of generated regions inside hand-written HTML.
//   <!-- github-sync:NAME:start --> … generated … <!-- github-sync:NAME:end -->
// Everything outside the markers is left byte-for-byte untouched.

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function listMarkers(html) {
  return [...html.matchAll(/<!--\s*github-sync:([^\s]+?):start\s*-->/g)].map((m) => m[1]);
}

export function replaceMarker(html, name, content) {
  const re = new RegExp(`(<!--\\s*github-sync:${esc(name)}:start\\s*-->)([\\s\\S]*?)([ \\t]*<!--\\s*github-sync:${esc(name)}:end\\s*-->)`);
  const m = html.match(re);
  if (!m) throw new Error(`Marker "github-sync:${name}" not found (or missing its end marker)`);
  const count = html.split(m[1]).length - 1;
  if (count !== 1) throw new Error(`Marker "github-sync:${name}" appears ${count} times`);
  return html.replace(re, (_, start, _old, end) => `${start}\n${content.replace(/\s+$/, '')}\n${end}`);
}

/** Validate that every start marker has exactly one matching end marker. */
export function validateMarkers(html) {
  const errors = [];
  const starts = listMarkers(html);
  const seen = new Set();
  for (const n of starts) {
    if (seen.has(n)) errors.push(`duplicate marker ${n}`);
    seen.add(n);
    const endCount = html.split(`github-sync:${n}:end`).length - 1;
    if (endCount !== 1) errors.push(`marker ${n} has ${endCount} end markers`);
  }
  const ends = [...html.matchAll(/<!--\s*github-sync:([^\s]+?):end\s*-->/g)].map((m) => m[1]);
  for (const n of ends) if (!seen.has(n)) errors.push(`end marker ${n} without start`);
  return errors;
}
