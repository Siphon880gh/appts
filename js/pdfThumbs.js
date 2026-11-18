// PDF page-1 previews (t64u). The server makes <sha>.thumb.jpg when it has Imagick, gs, or
// pdftoppm (api.php?action=thumb). When it has none (e.g. shared hosting) the thumb request 404s
// and the browser draws page 1 itself with the vendored pdf.js (vendor/pdfjs, no build step),
// caching the JPEG in IndexedDB. If that also fails, the plain "PDF" tile underneath stays.
import { fileURL } from './images.js';

const PDF_ID = /^[a-f0-9]{64}\.pdf$/;
export const thumbURL = id => PDF_ID.test(id || '') ? `api.php?action=thumb&id=${encodeURIComponent(id)}` : '';

/** The tile, with the thumbnail laid over it once it loads. */
export function pdfThumbHTML(id, tileHTML) {
  const url = thumbURL(id);
  return url ? `<span class="pdf-thumb">${tileHTML}<img class="pdf-thumb-img" data-pdf-thumb="${id}" src="${url}" alt="" loading="lazy" decoding="async"></span>` : tileHTML;
}

// ---- IndexedDB cache (per browser; cleared on sign-out) ----
const DB = 'appts-thumbs', STORE = 'thumbs';
let dbP = null;
function db() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  return dbP ||= new Promise(res => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => res(null);
  });
}
async function cacheGet(id) {
  const d = await db(); if (!d) return null;
  return new Promise(res => { const q = d.transaction(STORE).objectStore(STORE).get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
}
async function cachePut(id, blob) {
  const d = await db(); if (!d) return;
  await new Promise(res => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(blob, id); t.oncomplete = t.onerror = () => res(); });
}
export async function clearPdfThumbs() {
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
  if (dbP) { const d = await dbP; d?.close(); dbP = null; }
  await new Promise(res => { try { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch { res(); } });
}

// ---- pdf.js, loaded only when needed ----
let libP = null;
function pdfjs() {
  return libP ||= new Promise((res, rej) => {
    if (window.pdfjsLib) return res(window.pdfjsLib);
    const s = document.createElement('script'); s.src = 'vendor/pdfjs/pdf.min.js'; s.async = true;
    s.onload = () => { const lib = window.pdfjsLib; if (!lib) return rej(Error('pdf.js missing')); lib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js'; res(lib); };
    s.onerror = () => { libP = null; rej(Error('pdf.js not available')); };
    document.head.append(s);
  });
}
async function renderPage1(id) {
  const lib = await pdfjs();
  const r = await fetch(fileURL(id), { credentials: 'same-origin' });
  if (!r.ok) throw Error('PDF not available');
  const pdf = await lib.getDocument({ data: new Uint8Array(await r.arrayBuffer()), isEvalSupported: false, disableFontFace: true }).promise;
  try {
    const page = await pdf.getPage(1), base = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 480 / base.width });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(Error('no image')), 'image/jpeg', 0.82));
  } finally { pdf.destroy(); }
}

// One browser render per PDF at a time, two at once at most.
const urls = new Map(), pending = new Map();
let running = 0; const queue = [];
function schedule(fn) { return new Promise((res, rej) => { queue.push([fn, res, rej]); pump(); }); }
function pump() {
  while (running < 2 && queue.length) {
    const [fn, res, rej] = queue.shift(); running++;
    fn().then(res, rej).finally(() => { running--; pump(); });
  }
}
export function browserThumb(id) {
  if (urls.has(id)) return Promise.resolve(urls.get(id));
  if (pending.has(id)) return pending.get(id);
  const p = (async () => {
    let blob = await cacheGet(id);
    if (!blob) { blob = await schedule(() => renderPage1(id)); cachePut(id, blob); }
    const u = URL.createObjectURL(blob); urls.set(id, u); return u;
  })().finally(() => pending.delete(id));
  pending.set(id, p);
  return p;
}

document.addEventListener('load', e => { const img = e.target; if (img instanceof HTMLImageElement && img.dataset.pdfThumb) img.classList.add('ready'); }, true);
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.pdfThumb) return;
  if (img.dataset.fallback) { img.remove(); return; } // the browser render failed too: keep the PDF tile
  img.dataset.fallback = 'browser';
  browserThumb(img.dataset.pdfThumb).then(u => { img.src = u; }, () => img.remove());
}, true);
