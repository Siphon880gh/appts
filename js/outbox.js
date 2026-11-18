// Offline mode state and the queue of changes made while it is on (or while earlier offline changes
// still wait to sync). Queued records live in IndexedDB "appts-offline": store "pending" holds one item
// per record ({key, account, kind, id, base, ours}), store "files" holds documents added offline.
import { applyLocal, overlay, COLLECTIONS } from './merge.js';
export const STATE_KEY = 'appts-offline';
export const SHELL_CACHE = 'appts-offline-shell', STATE_CACHE = 'appts-offline-state', FLAG = './__appts-offline-mode';
export const accountCache = account => `appts-offline-acct-${account}`;
export const ctx = { account: null, pending: 0, files: 0 };

export function readState() { try { return JSON.parse(localStorage.getItem(STATE_KEY)) || { on: false }; } catch { return { on: false }; } }
export function writeState(state) { localStorage.setItem(STATE_KEY, JSON.stringify(state)); return state; }
/** Writes are queued while Offline mode is on, and until earlier queued changes have synced. */
export const queueing = () => !!(readState().on || ctx.pending || ctx.files);

let dbPromise;
function db() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open('appts-offline', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('pending', { keyPath: 'key' }); req.result.createObjectStore('files', { keyPath: 'key' }); };
    req.onsuccess = () => resolve(req.result); req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}
async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode), s = t.objectStore(store); let result;
    Promise.resolve(fn(s)).then(r => { result = r; });
    t.oncomplete = () => resolve(result); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error || Error('Saving on this device failed.'));
  });
}
const all = store => tx(store, 'readonly', s => new Promise(r => { const q = s.getAll(); q.onsuccess = () => r(q.result); }));
export async function listPending(account = ctx.account) { return (await all('pending')).filter(p => p.account === account).sort((a, b) => a.at < b.at ? -1 : 1); }
export async function listFiles(account = ctx.account) { return (await all('files')).filter(f => f.account === account); }
export async function refreshCounts(account = ctx.account) {
  try { ctx.pending = (await listPending(account)).length; ctx.files = (await listFiles(account)).length; } catch { ctx.pending = ctx.files = 0; }
  return ctx;
}
export async function removePending(keys) { await tx('pending', 'readwrite', s => keys.forEach(k => s.delete(k))); await refreshCounts(); }
export async function updatePending(items) { await tx('pending', 'readwrite', s => items.forEach(p => s.put(p))); await refreshCounts(); }
export async function removeFile(key) { await tx('files', 'readwrite', s => s.delete(key)); await refreshCounts(); }
export async function clearAccount(account) {
  await tx('pending', 'readwrite', s => new Promise(r => { const q = s.getAll(); q.onsuccess = () => { q.result.filter(p => p.account === account).forEach(p => s.delete(p.key)); r(); }; }));
  await tx('files', 'readwrite', s => new Promise(r => { const q = s.getAll(); q.onsuccess = () => { q.result.filter(p => p.account === account).forEach(p => s.delete(p.key)); r(); }; }));
  await refreshCounts(account);
}

/** Apply ops to the local document and remember each touched record (first-seen base, latest value). */
export async function queueOps(doc, ops) {
  const account = ctx.account;
  if (!account) throw Error('Sign in again before saving.');
  const next = applyLocal(doc, ops);
  const touched = new Map();
  for (const op of ops) touched.set(`${account}|${op.kind}|${op.op === 'put' ? op.value.id : op.id}`, op);
  // A deleted tag is also removed from entries: queue those entries too.
  for (const op of ops) if (op.op === 'delete' && op.kind === 'tag') for (const e of doc.entries) if ((e.tagIds || []).includes(op.id)) touched.set(`${account}|entry|${e.id}`, { kind: 'entry', id: e.id, op: 'put', value: e });
  const existing = new Map((await listPending(account)).map(p => [p.key, p]));
  const items = [], drop = [];
  for (const [key, op] of touched) {
    const id = op.op === 'put' ? op.value.id : op.id, col = COLLECTIONS[op.kind];
    const before = existing.get(key);
    const base = before ? before.base : (doc[col].find(r => r.id === id) || null);
    const ours = next[col].find(r => r.id === id) || null;
    if (!base && !ours) { if (before) drop.push(key); continue; }
    items.push({ key, account, kind: op.kind, id, base, ours, at: before ? before.at : new Date().toISOString(), changedAt: new Date().toISOString() });
  }
  await tx('pending', 'readwrite', s => { items.forEach(p => s.put(p)); drop.forEach(k => s.delete(k)); });
  await refreshCounts(account);
  return next;
}

/** The server or saved document with this account's queued changes on top. */
export async function withPending(account, doc) {
  ctx.account = account?.username || account || null;
  try { await refreshCounts(); return ctx.pending ? overlay(doc, await listPending()) : doc; } catch { return doc; }
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'application/pdf': 'pdf' };
/** Keep a document added offline: content-addressed like the server, and readable at its usual URL. */
export async function queueFile(file) {
  const account = ctx.account;
  const bytes = await file.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  const mime = file.type, id = `${hash}.${EXT[mime]}`;
  const blob = new Blob([bytes], { type: mime });
  const meta = { id, mime, kind: mime === 'application/pdf' ? 'pdf' : 'image', bytes: blob.size, name: file.name || (mime === 'application/pdf' ? 'document.pdf' : 'pasted-image.png'), createdAt: new Date().toISOString() };
  await tx('files', 'readwrite', s => s.put({ key: `${account}|${id}`, account, ...meta, blob }));
  await cacheFile(account, meta, blob);
  await refreshCounts(account);
  return meta;
}
export async function cacheFile(account, meta, blob) {
  const cache = await caches.open(accountCache(account));
  await cache.put(new URL(`api.php?action=file&id=${encodeURIComponent(meta.id)}`, location.href).href, new Response(blob, { headers: { 'Content-Type': meta.mime, 'Content-Length': String(blob.size), 'X-Appts-Offline': 'queued' } }));
  navigator.serviceWorker?.controller?.postMessage({ type: 'appts-offline-reindex' });
}
