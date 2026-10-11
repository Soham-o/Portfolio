// Small shared helpers: filesystem, hashing, escaping, dates.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export async function readJson(file, fallback = undefined) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== undefined) return structuredClone(fallback);
    if (err.code === 'ENOENT') return undefined;
    throw new Error(`Could not parse JSON in ${file}: ${err.message}`);
  }
}

export async function readText(file, fallback = undefined) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw err;
  }
}

/** Write via temp file + rename so a crash never leaves a half-written file. */
export async function writeFileAtomic(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, content);
  await fs.rename(tmp, file);
}

export function stableJson(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

export function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Only allow http(s) and mailto URLs into attributes; everything else becomes '#'. */
export function safeUrl(url, { allowMailto = true } = {}) {
  if (typeof url !== 'string' || !url.trim()) return null;
  try {
    const u = new URL(url.trim());
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
    if (allowMailto && u.protocol === 'mailto:') return u.href;
  } catch {
    /* not absolute */
  }
  return null;
}

export function slugify(text) {
  const s = String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'project';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtMonth(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export function dayKey(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

export function hoursBetween(a, b) {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 36e5;
}

export function truncate(text, max) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,.;:\-–—\s]+$/, '') + '…';
}

export function formatCount(n) {
  if (n == null) return '';
  if (n >= 10000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

export const noopLogger = { info() {}, warn() {}, error() {}, debug() {} };

export function consoleLogger({ debug = false } = {}) {
  return {
    info: (...a) => console.log(...a),
    warn: (...a) => console.warn('warning:', ...a),
    error: (...a) => console.error('error:', ...a),
    debug: (...a) => { if (debug) console.log('debug:', ...a); },
  };
}
