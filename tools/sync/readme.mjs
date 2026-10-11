// README → structured, sanitized HTML.
// Repository content is untrusted: everything goes through sanitize-html with a strict allowlist,
// relative links/images are rewritten to absolute GitHub URLs, and nothing is ever executed.
import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { truncate } from './util.mjs';

const BADGE_HOSTS = [
  'img.shields.io', 'shields.io', 'badgen.net', 'badge.fury.io', 'github-readme-stats.vercel.app',
  'github-readme-streak-stats.herokuapp.com', 'capsule-render.vercel.app', 'skillicons.dev',
  'readme-typing-svg.herokuapp.com', 'readme-typing-svg.demolab.com', 'komarev.com', 'travis-ci.org', 'travis-ci.com',
  'codecov.io', 'coveralls.io', 'app.codacy.com', 'api.codeclimate.com', 'circleci.com', 'forthebadge.com',
  'visitor-badge.laobi.icu', 'hits.seeyoufarm.com', 'stackshare.io', 'deepscan.io', 'snyk.io', 'starchart.cc',
  'api.star-history.com', 'contrib.rocks', 'opencollective.com', 'cdn.jsdelivr.net/gh/devicons', 'raw.githubusercontent.com/devicons',
];

const DEMO_HOSTS = [
  'vercel.app', 'netlify.app', 'github.io', 'streamlit.app', 'hf.space', 'huggingface.co/spaces', 'onrender.com',
  'herokuapp.com', 'pages.dev', 'workers.dev', 'fly.dev', 'railway.app', 'web.app', 'firebaseapp.com', 'surge.sh',
  'glitch.me', 'replit.app', 'repl.co', 'gradio.live', 'azurewebsites.net', 'appspot.com',
];

const SECTION_KINDS = [
  ['problem', /\b(problem|motivation|why|background|the challenge|pain point)/i],
  ['features', /\b(features?|highlights|what it does|capabilities|key points|functionalit)/i],
  ['architecture', /\b(how it works|architecture|design|workflow|pipeline|system|flow|under the hood|internals)/i],
  ['stack', /\b(tech(nology|nologies)?( stack)?|stack|built with|tools( used)?|dependencies|libraries)/i],
  ['setup', /\b(install|setup|set up|getting started|quick ?start|prerequisites|requirements|configuration|deploy)/i],
  ['usage', /\b(usage|how to use|examples?|running|run |run$|commands|api)/i],
  ['demo', /\b(demo|screenshots?|preview|output|results?|gallery|showcase)/i],
  ['about', /\b(about|overview|introduction|intro|description|what is|summary|objective|purpose|goals?)/i],
  ['license', /\blicen[cs]e/i],
  ['meta', /\b(contribut|contact|author|acknowledg|credits|support|faq|roadmap|todo|changelog)/i],
];

export function classifySection(title) {
  for (const [kind, re] of SECTION_KINDS) if (re.test(title)) return kind;
  return 'other';
}

/** GitHub-style heading slug: lowercase, drop punctuation, spaces → hyphens. */
export function githubSlug(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

export function isBadgeUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (BADGE_HOSTS.some((h) => lower.includes(`//${h}`))) return true;
  return /\/badge(s)?[/.?]|badge\.svg|\/workflows\/.*\/badge|\/actions\/workflows\/.*\.svg/.test(lower);
}

function isDemoUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'github.com' || u.hostname.endsWith('githubusercontent.com')) return false;
    const hostPath = (u.hostname + u.pathname).toLowerCase();
    return DEMO_HOSTS.some((h) => hostPath.includes(h));
  } catch {
    return false;
  }
}

/**
 * Build a resolver that turns README-relative URLs into absolute, safe GitHub URLs.
 * kind: 'link' → github.com blob URL, 'image' → raw.githubusercontent.com URL.
 */
export function makeUrlResolver({ owner, repo, branch, readmePath = 'README.md' }) {
  const dir = readmePath.includes('/') ? readmePath.slice(0, readmePath.lastIndexOf('/') + 1) : '';
  const enc = (p) => p.split('/').map((s) => encodeURIComponent(decodeURIComponentSafe(s))).join('/');
  return function resolve(url, kind = 'link') {
    if (typeof url !== 'string') return null;
    const u = url.trim();
    if (!u) return null;
    if (u.startsWith('#')) {
      if (kind !== 'link') return null;
      const frag = decodeURIComponentSafe(u.slice(1));
      if (frag.startsWith('readme-')) return `#${githubSlug(frag)}`; // already rewritten (idempotent)
      return `#readme-${githubSlug(frag)}`;
    }
    if (u.startsWith('//')) return null; // protocol-relative: ambiguous, drop
    const scheme = u.match(/^([a-z][a-z0-9+.-]*):/i);
    if (scheme) {
      const s = scheme[1].toLowerCase();
      if (s === 'mailto' && kind === 'link') return u;
      if (s !== 'http' && s !== 'https') return null; // javascript:, data:, vbscript:, file: …
      let abs;
      try { abs = new URL(u); } catch { return null; }
      if (kind === 'image') {
        if (abs.protocol === 'http:') abs.protocol = 'https:'; // avoid mixed content
        const m = abs.hostname === 'github.com' && abs.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
        if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
      }
      return abs.href;
    }
    // Relative path inside the repository
    let resolved;
    try {
      const base = new URL(`https://repo.invalid/${u.startsWith('/') ? '' : dir}`);
      resolved = new URL(u.replace(/^\/+/, u.startsWith('/') ? '/' : ''), base);
    } catch {
      return null;
    }
    const repoPath = resolved.pathname.replace(/^\/+/, '');
    const suffix = `${resolved.search}${resolved.hash}`;
    if (kind === 'image') {
      return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${enc(repoPath)}${resolved.search}`;
    }
    return `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(branch)}/${enc(repoPath)}${suffix}`;
  };
}

function decodeURIComponentSafe(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

export function sanitizeReadmeHtml(html, resolve) {
  return sanitizeHtml(html, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'a', 'img', 'picture', 'source', 'ul', 'ol', 'li',
      'strong', 'em', 'b', 'i', 'u', 'del', 's', 'code', 'pre', 'blockquote', 'table', 'thead', 'tbody', 'tfoot',
      'tr', 'th', 'td', 'details', 'summary', 'kbd', 'sup', 'sub', 'div', 'span', 'input', 'dl', 'dt', 'dd', 'mark',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'align', 'loading', 'decoding', 'referrerpolicy'],
      source: ['srcset', 'media', 'type'],
      h1: ['id'], h2: ['id'], h3: ['id'], h4: ['id'], h5: ['id'], h6: ['id'],
      p: ['align'], div: ['align'], td: ['align', 'colspan', 'rowspan'], th: ['align', 'colspan', 'rowspan'],
      ol: ['start'], input: ['type', 'checked', 'disabled'], code: ['class'], details: ['open'],
    },
    allowedClasses: { code: ['language-*'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tagName, attribs) => {
        const out = {};
        const href = resolve(attribs.href, 'link');
        if (href) {
          out.href = href;
          if (!href.startsWith('#')) {
            out.target = '_blank';
            out.rel = 'noopener noreferrer nofollow';
          }
        }
        if (attribs.title) out.title = attribs.title;
        return { tagName, attribs: out };
      },
      img: (tagName, attribs) => {
        const out = { ...attribs, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' };
        const src = resolve(attribs.src, 'image');
        if (src) out.src = src; else delete out.src;
        return { tagName, attribs: out };
      },
      source: (tagName, attribs) => {
        const out = { ...attribs };
        if (attribs.srcset) {
          const parts = attribs.srcset.split(',').map((p) => {
            const [u, d] = p.trim().split(/\s+/);
            const r = resolve(u, 'image');
            return r ? (d ? `${r} ${d}` : r) : null;
          }).filter(Boolean);
          if (parts.length) out.srcset = parts.join(', '); else delete out.srcset;
        }
        return { tagName, attribs: out };
      },
      input: (tagName, attribs) => ({
        tagName,
        attribs: attribs.type === 'checkbox'
          ? { type: 'checkbox', disabled: '', ...(attribs.checked !== undefined ? { checked: '' } : {}) }
          : { type: 'hidden' },
      }),
      ...Object.fromEntries(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((h) => [h, (tagName, attribs) => ({
        tagName,
        attribs: attribs.id && /^readme-[\p{L}\p{N}_-]*$/u.test(attribs.id) ? { id: attribs.id } : {},
      })])),
    },
    exclusiveFilter: (frame) =>
      (frame.tag === 'img' && !frame.attribs.src) ||
      (frame.tag === 'source' && !frame.attribs.srcset) ||
      (frame.tag === 'input' && frame.attribs.type === 'hidden'),
  });
}

/** Strip markdown/HTML from a snippet to get readable plain text. */
export function plainText(md) {
  return String(md ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_~`>#]+/g, '')
    .replace(/:[a-z0-9_+-]+:/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstParagraphText(tokens) {
  for (const t of tokens) {
    if (t.type === 'paragraph') {
      const text = plainText(t.text);
      // Skip paragraphs that are only badges/images/links
      if (text.length >= 25) return text;
    }
  }
  return '';
}

function listItems(tokens, max = 8) {
  for (const t of tokens) {
    if (t.type === 'list') {
      return t.items.map((i) => truncate(plainText(i.text.split('\n')[0]), 160)).filter((s) => s.length > 2).slice(0, max);
    }
  }
  return [];
}

/**
 * Process README markdown into sections.
 * Returns null-safe structure even for empty input.
 */
export function processReadme(markdown, { owner, repo, branch, readmePath = 'README.md', maxBytes = 300_000, repoName } = {}) {
  let md = String(markdown ?? '');
  let truncated = false;
  if (Buffer.byteLength(md, 'utf8') > maxBytes) {
    md = Buffer.from(md, 'utf8').subarray(0, maxBytes).toString('utf8');
    md = md.slice(0, md.lastIndexOf('\n') > 0 ? md.lastIndexOf('\n') : md.length);
    truncated = true;
  }
  const resolve = makeUrlResolver({ owner, repo, branch, readmePath });

  // Per-document slugger and heading depth mapping
  const used = new Map();
  const slug = (text) => {
    const base = githubSlug(text) || 'section';
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
  let depthShift = 0;
  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      heading(token) {
        const inner = this.parser.parseInline(token.tokens);
        const id = `readme-${slug(plainText(token.text))}`;
        const depth = Math.min(6, Math.max(2, token.depth + depthShift));
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
    },
  });

  const tokens = marked.lexer(md);
  // Drop a leading H1 (project title) and leading badge-only paragraphs from the overview
  let title = null;
  const firstHeadingIdx = tokens.findIndex((t) => t.type === 'heading');
  if (firstHeadingIdx !== -1 && tokens[firstHeadingIdx].depth === 1) {
    const before = tokens.slice(0, firstHeadingIdx);
    const onlyDecor = before.every((t) => t.type === 'space' || t.type === 'html' || (t.type === 'paragraph' && plainText(t.text).length < 25));
    if (onlyDecor) {
      title = plainText(tokens[firstHeadingIdx].text);
      tokens.splice(firstHeadingIdx, 1);
    }
  }

  const headings = tokens.filter((t) => t.type === 'heading');
  const sectionDepth = headings.length ? Math.min(...headings.map((h) => h.depth)) : 2;

  const groups = [{ heading: null, tokens: [] }];
  for (const t of tokens) {
    if (t.type === 'heading' && t.depth === sectionDepth) groups.push({ heading: t, tokens: [t] });
    else groups[groups.length - 1].tokens.push(t);
  }

  const parse = (toks, shift) => {
    depthShift = shift;
    const list = Object.assign([...toks], { links: tokens.links || {} });
    return sanitizeReadmeHtml(marked.parser(list), resolve);
  };

  const sections = [];
  let overviewHtml = '';
  let overviewTokens = [];
  for (const g of groups) {
    if (!g.heading) {
      overviewTokens = g.tokens;
      overviewHtml = parse(g.tokens, 2 - sectionDepth).trim();
      continue;
    }
    const sectionTitle = plainText(g.heading.text) || 'Section';
    const html = parse(g.tokens, 2 - sectionDepth).trim();
    const idMatch = html.match(/^<h2 id="([^"]+)"/);
    sections.push({
      id: idMatch ? idMatch[1] : `readme-${githubSlug(sectionTitle)}`,
      title: truncate(sectionTitle, 80),
      kind: classifySection(sectionTitle),
      html,
      _tokens: g.tokens.slice(1),
    });
  }

  const allHtml = [overviewHtml, ...sections.map((s) => s.html)].join('\n');
  const images = [...allHtml.matchAll(/<img[^>]*\bsrc="([^"]+)"/g)].map((m) => decodeEntities(m[1]));
  const contentImages = [...new Set(images.filter((u) => !isBadgeUrl(u)))];

  const links = [...allHtml.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({
    url: decodeEntities(m[1]),
    text: plainText(m[2]),
  }));
  const demoLinks = [];
  for (const l of links) {
    if (!/^https?:/.test(l.url) || isBadgeUrl(l.url)) continue;
    if (isDemoUrl(l.url) || /\b(live demo|demo|try it|live site|deployed|website)\b/i.test(l.text)) {
      if (!demoLinks.some((d) => d.url === l.url) && !/github\.com\//.test(l.url)) demoLinks.push(l);
    }
  }

  const byKind = (k) => sections.find((s) => s.kind === k);
  const featuresSec = byKind('features');
  const problemSec = byKind('problem');
  const aboutSec = byKind('about');
  const overviewText = firstParagraphText(overviewTokens) || (aboutSec ? firstParagraphText(aboutSec._tokens) : '');

  const highlights = {
    overview: overviewText ? truncate(overviewText, 420) : '',
    problem: problemSec ? truncate(firstParagraphText(problemSec._tokens), 320) : '',
    features: featuresSec ? listItems(featuresSec._tokens) : [],
  };

  for (const s of sections) delete s._tokens;

  return {
    title,
    overviewHtml,
    sections,
    images: contentImages,
    firstImage: contentImages[0] ?? null,
    demoLinks: demoLinks.slice(0, 3),
    highlights,
    excerpt: overviewText ? truncate(overviewText, 220) : '',
    truncated,
  };
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/**
 * Defence in depth: re-sanitize stored README HTML at render time. Input is expected to already be
 * absolute (it was rewritten during sync); anything relative is dropped.
 */
export function resanitize(html) {
  const resolve = (url, kind) => {
    if (typeof url !== 'string') return null;
    const u = url.trim();
    if (u.startsWith('#readme-') && kind === 'link') return u;
    if (/^https:\/\//i.test(u)) return u;
    if (/^http:\/\//i.test(u) && kind === 'link') return u;
    if (/^mailto:/i.test(u) && kind === 'link') return u;
    return null;
  };
  return sanitizeReadmeHtml(String(html ?? ''), resolve);
}
