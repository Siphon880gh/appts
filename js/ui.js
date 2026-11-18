// Shared rendering helpers. All user text goes through esc().
import * as S from './schema.js';
import { typeBadge } from './icons.js';
import { store } from './store.js';
import { imageURL } from './images.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
export const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';

export function searchBox(id, value, label, placeholder) {
  return `<div class="search"><label for="${id}" class="skip">${esc(label)}</label>${SEARCH_ICON}<input id="${id}" type="search" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></div>`;
}
export function tagChip(tag) {
  return tag ? `<span class="tag" style="--tag-color:${esc(tag.color || '#5c6674')}"><i aria-hidden="true"></i>${esc(S.tagDisplayLabel(store.doc, tag))}</span>` : '';
}
export function tagsFor(entry) {
  return (entry.tagIds || []).map(id => store.doc.tags.find(t => t.id === id)).filter(Boolean);
}
/** "12:30 PM" / "4:15 pm" / "16:15" -> "16:15" for a datetime attribute ('' when unreadable). */
function isoTime(t) {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?\s*$/i.exec(t || '') || /^\s*(\d{1,2}):(\d{2})\s*$/.exec(t || '');
  if (!m) return '';
  let h = +m[1]; const min = m[2] || '00', ap = (m[3] || '').toLowerCase();
  if (ap === 'p' && h < 12) h += 12; if (ap === 'a' && h === 12) h = 0;
  return h < 24 && +min < 60 ? `${String(h).padStart(2, '0')}:${min}` : '';
}
/** A date as "Sep 11, 2026" (plus the time when there is one) with "68 days ago" / "In 14 days" /
 *  "Today" in smaller text below it, in one <time datetime> (t36u). */
export function relLabel(date, { time = '' } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return '';
  const n = S.daysBetween(S.today(), date), t = isoTime(time);
  return `<time class="when" datetime="${esc(date)}${t ? `T${t}` : ''}"><span class="when-date">${esc(S.formatDate(date))}${time ? ` · ${esc(time)}` : ''}</span><span class="rel ${n < 0 ? 'past' : n <= 7 ? 'soon' : ''}">${esc(S.relativeDay(date))}</span></time>`;
}
/** The time of day for an event, when its entry has a "time" field and the event is the main date. */
export function eventTime(entry, ev) { return ev?.primary !== false && typeof entry?.values?.time === 'string' ? entry.values.time.trim() : ''; }
export function dateBlock(date) {
  const d = new Date(`${date}T12:00:00`);
  return `<span class="date-block" aria-hidden="true"><span>${d.toLocaleDateString(undefined, { month: 'short' })}</span><b>${d.getDate()}</b><span>${d.toLocaleDateString(undefined, { weekday: 'short' })}</span></span>`;
}
/** A condition's short name; with a description it gets a hover title, a small * marker, and the
 *  description as visually hidden text so screen readers hear it too (t30u). */
export function condNameHTML(c) {
  const d = S.conditionDescription(c);
  return d ? `<span class="cond-name has-desc" data-desc="${esc(d)}">${esc(c.name)}<span class="cond-desc-mark" aria-hidden="true">*</span><span class="skip"> — ${esc(d)}</span></span>` : esc(c?.name);
}
// Condition description popover (t59u): a styled popup instead of the browser's plain title tooltip.
// Opens on hover and keyboard focus (of the name or the link around it), on tap on touch screens;
// closes on Esc, an outside click/tap, scroll, or moving away.
let dpEl = null, dpFor = null, dpHide = 0, dpPointer = 'mouse';
function descPop() {
  if (dpEl) return dpEl;
  dpEl = document.createElement('div'); dpEl.id = 'desc-pop'; dpEl.className = 'desc-pop'; dpEl.setAttribute('role', 'tooltip'); dpEl.hidden = true;
  dpEl.addEventListener('mouseenter', () => clearTimeout(dpHide)); dpEl.addEventListener('mouseleave', () => hideDesc(150));
  document.body.append(dpEl); return dpEl;
}
function showDesc(name) {
  const el = descPop(); clearTimeout(dpHide);
  el.innerHTML = '<span class="desc-arrow" aria-hidden="true"></span><b></b><p></p>';
  el.querySelector('b').textContent = name.firstChild?.textContent || '';
  el.querySelector('p').textContent = name.dataset.desc;
  el.hidden = false; dpFor = name;
  const r = name.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  const left = Math.max(12, Math.min(r.left, window.innerWidth - w - 12));
  const below = window.innerHeight - r.bottom >= h + 16 || r.top < h + 16;
  el.classList.toggle('above', !below);
  el.style.left = `${left + window.scrollX}px`; el.style.top = `${(below ? r.bottom + 10 : r.top - h - 10) + window.scrollY}px`;
  el.style.setProperty('--arrow-x', `${Math.max(14, Math.min(w - 14, r.left + 18 - left))}px`);
}
export function hideDesc(delay = 0) { clearTimeout(dpHide); const go = () => { if (dpEl) dpEl.hidden = true; dpFor = null; }; if (delay) dpHide = setTimeout(go, delay); else go(); }
const descOf = t => t?.closest?.('.cond-name.has-desc') || t?.querySelector?.(':scope .cond-name.has-desc');
document.addEventListener('pointerdown', e => { dpPointer = e.pointerType || 'mouse'; }, true);
document.addEventListener('mouseover', e => { if (dpPointer !== 'mouse') return; const n = e.target.closest?.('.cond-name.has-desc'); if (n) { if (n !== dpFor) showDesc(n); else clearTimeout(dpHide); } else if (dpFor && !dpEl?.contains(e.target)) hideDesc(150); });
document.addEventListener('focusin', e => { const n = e.target.matches?.('a,button,[tabindex]') ? descOf(e.target) : null; if (n && e.target.matches(':focus-visible')) showDesc(n); else if (dpFor) hideDesc(); });
document.addEventListener('click', e => {
  const n = e.target.closest?.('.cond-name.has-desc');
  if (n && dpPointer !== 'mouse' && n !== dpFor) { e.preventDefault(); e.stopPropagation(); showDesc(n); return; } // first tap shows, second follows the link
  if (dpFor && !dpEl?.contains(e.target)) hideDesc();
}, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && dpFor) hideDesc(); });
window.addEventListener('scroll', () => { if (dpFor) hideDesc(); }, { passive: true });
/** Attributes for an <option> naming a condition: the description as its hover title. */
export const condOptionAttrs = c => { const d = S.conditionDescription(c); return d ? ` title="${esc(d)}"` : ''; };
export function conditionName(id) { return store.doc.conditions.find(c => c.id === id)?.name || 'Unknown condition'; }

/** One line that tells you the most about an entry: status, who, where. */
export function entrySummary(entry, type) {
  const doc = store.doc, bits = [];
  for (const f of type.fields) {
    if (bits.length >= 3) break;
    const v = entry.values?.[f.id];
    if (v === undefined || v === '' || v === null || f.kind === 'longtext' || f.kind === 'date' || (f.kind === 'checkbox' && !v)) continue;
    bits.push(f.kind === 'checkbox' ? f.label : f.kind === 'link' ? S.displayValue(doc, f, v) : S.displayValue(doc, f, v));
  }
  return bits;
}
// ---- list icons: key highlight ★ and attachments 📎 (t44u); Quick preview popover (t49u) ----
let tipSeq = 0;
/** Files on a record: {total, pdf, image, other, hint}. */
export function attachmentInfo(list) {
  const out = { total: 0, pdf: 0, image: 0, other: 0 };
  for (const a of list || []) { out.total++; if (a.kind === 'pdf' || /\.pdf$/i.test(a.id || '')) out.pdf++; else if (a.kind === 'image' || /\.(png|jpe?g|gif|webp)$/i.test(a.id || '')) out.image++; else out.other++; }
  out.hint = [out.pdf && plural(out.pdf, 'PDF'), out.image && plural(out.image, 'image'), out.other && plural(out.other, 'file')].filter(Boolean).join(', ');
  return out;
}
/** Icons for a list item. Returns {html, ids, label}: ids for aria-describedby, label text for aria-label.
 *  The ★ text is hidden visually; it is read by screen readers and shown in the Quick preview popover. */
export function itemIcons({ highlight = '', attachments = [], heading = 'Key highlight', gallery = '' } = {}) {
  const parts = [], ids = [], label = [];
  const hl = String(highlight || '').trim();
  if (hl) {
    const id = `tip-${++tipSeq}`; ids.push(id);
    parts.push(`<span class="hl-icon" title="${esc(heading)}"><span aria-hidden="true">★</span><span class="skip" id="${id}">${esc(heading)}: ${esc(hl)}</span></span>`);
    label.push(`has a ${heading.toLowerCase()}`);
  }
  const a = attachmentInfo(attachments);
  if (a.total) {
    parts.push(`<span class="att-icon"${gallery ? ` data-gallery="${esc(gallery)}"` : ''} title="${esc(a.hint)}"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M16.5 6.5l-7.8 7.8a2 2 0 0 0 2.8 2.8l8.1-8.1a4 4 0 0 0-5.7-5.7L5.6 11.6a6 6 0 0 0 8.5 8.5l6.4-6.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>${a.pdf ? '<span class="att-kind">PDF</span>' : ''}${a.image ? '<span class="att-kind">IMG</span>' : ''}<span class="att-count">${a.total}</span><span class="skip">${esc(a.hint)}</span></span>`);
    label.push(a.hint);
  }
  return { html: parts.length ? `<span class="item-icons">${parts.join('')}</span>` : '', ids, label: label.join('; ') };
}
export const entryIcons = entry => itemIcons({ highlight: entry?.highlight, attachments: entry?.attachments, gallery: entry ? `entry:${entry.id}` : '' });

// Quick preview (t49u): a mode, off by default and remembered on this device. When on, hovering
// (or focusing) an entry row shows a roomy popover with its key highlight and notes, keeping the
// note's spacing and line breaks. When off there is no hover popover at all.
const QP_KEY = 'appts.quickPreview';
export const quickPreviewOn = () => { try { return localStorage.getItem(QP_KEY) === '1'; } catch { return false; } };
export function setQuickPreview(on) {
  try { localStorage.setItem(QP_KEY, on ? '1' : '0'); } catch { /* private mode: session only */ }
  document.documentElement.classList.toggle('qp-on', !!on);
  document.querySelectorAll('[data-action=toggle-quick-preview]').forEach(b => b.setAttribute('aria-pressed', String(!!on)));
  if (!on) hideQuickPreview();
}
export const quickPreviewToggle = () => `<button type="button" class="qp-toggle" data-action="toggle-quick-preview" aria-pressed="${quickPreviewOn()}" title="When on, hover an entry to preview its notes and key highlight"><span class="qp-switch" aria-hidden="true"></span>Quick preview</button>`;
document.documentElement.classList.toggle('qp-on', quickPreviewOn());
/** Note HTML -> plain text with its paragraphs and line breaks kept (never inserted as HTML). */
export function noteText(notes) {
  if (!notes) return '';
  if (!notes.html) return String(notes.text || '');
  const body = new DOMParser().parseFromString(String(notes.html), 'text/html').body;
  body.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
  body.querySelectorAll('li').forEach(li => li.prepend('• '));
  body.querySelectorAll('li,tr').forEach(el => el.append('\n'));
  body.querySelectorAll('p,div,h1,h2,h3,h4,blockquote,pre,ul,ol,table').forEach(el => el.append('\n\n'));
  return body.textContent.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
let qpEl = null, qpFor = null, qpTimer = 0, qpHideTimer = 0;
function qpPanel() {
  if (qpEl) return qpEl;
  qpEl = document.createElement('div');
  qpEl.id = 'quick-preview'; qpEl.className = 'qp-pop'; qpEl.setAttribute('role', 'tooltip'); qpEl.hidden = true;
  qpEl.addEventListener('mouseenter', () => clearTimeout(qpHideTimer));
  qpEl.addEventListener('mouseleave', () => scheduleHide());
  document.body.append(qpEl);
  return qpEl;
}
export function hideQuickPreview() { clearTimeout(qpTimer); if (qpEl) qpEl.hidden = true; qpFor = null; }
const scheduleHide = () => { clearTimeout(qpHideTimer); qpHideTimer = setTimeout(hideQuickPreview, 180); };
function showQuickPreview(row) {
  const entry = S.entryById(store.doc, row.dataset.id); if (!entry) return;
  const hl = String(entry.highlight || '').trim(), notes = noteText(entry.notes), files = attachmentInfo(entry.attachments);
  const el = qpPanel();
  el.innerHTML = `<p class="qp-title"></p>${hl ? '<div class="qp-hl"><b>★ Key highlight</b><div class="qp-text"></div></div>' : ''}${notes ? '<div class="qp-notes"><b>Notes</b><div class="qp-text"></div></div>' : ''}${!hl && !notes ? '<p class="qp-empty">No notes or key highlight on this entry.</p>' : ''}${files.total ? `<p class="qp-files">📎 ${esc(files.hint)}</p>` : ''}<p class="qp-open-row"><button type="button" class="qp-open" data-qp-open>Open entry ›</button></p>`;
  el.querySelector('.qp-title').textContent = entry.title;
  if (hl) el.querySelector('.qp-hl .qp-text').textContent = hl;
  if (notes) el.querySelector('.qp-notes .qp-text').textContent = notes;
  el.hidden = false; qpFor = row;
  const r = row.getBoundingClientRect(), w = Math.min(620, window.innerWidth - 24);
  el.style.width = `${w}px`;
  const left = Math.max(12, Math.min(r.left + 24, window.innerWidth - w - 12));
  const h = el.offsetHeight, below = window.innerHeight - r.bottom;
  const top = below >= h + 12 || below >= r.top ? r.bottom + 6 : Math.max(12, r.top - h - 6);
  el.style.left = `${left + window.scrollX}px`; el.style.top = `${top + window.scrollY}px`;
}
const qpRow = t => t?.closest?.('.event[data-id], .entry-row[data-id]');
document.addEventListener('mouseover', e => {
  if (!quickPreviewOn()) return;
  const row = qpRow(e.target); if (!row) return;
  if (e.target.closest('[data-gallery]')) { clearTimeout(qpTimer); if (qpFor) hideQuickPreview(); return; } // 📎 gallery wins (t53u)
  clearTimeout(qpHideTimer);
  if (row === qpFor) return;
  clearTimeout(qpTimer); qpTimer = setTimeout(() => showQuickPreview(row), 220);
});
document.addEventListener('mouseout', e => { if (!quickPreviewOn()) return; const row = qpRow(e.target); if (row && !row.contains(e.relatedTarget)) { clearTimeout(qpTimer); if (qpFor) scheduleHide(); } });
document.addEventListener('focusin', e => { if (!quickPreviewOn()) return; const row = qpRow(e.target); if (row && row.matches(':focus-visible')) showQuickPreview(row); else if (!qpEl?.contains(e.target)) hideQuickPreview(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && qpEl && !qpEl.hidden) hideQuickPreview(); });
window.addEventListener('scroll', () => { if (qpFor) hideQuickPreview(); }, { passive: true });
// Touch / iPad: with Quick preview on, the first tap on a tile shows its preview; tapping the same
// tile again (or "Open entry" in the preview) opens it; a tap anywhere else dismisses the preview.
let lastPointer = 'mouse', qpBypass = false;
document.addEventListener('pointerdown', e => { lastPointer = e.pointerType || 'mouse'; }, true);
document.addEventListener('keydown', () => { lastPointer = 'mouse'; }, true);
document.addEventListener('click', e => {
  if (agEl && agEl.contains(e.target)) { if (e.target.closest('[data-action=view-file]')) setTimeout(hideGallery, 0); return; }
  const clip = e.target.closest?.('[data-gallery]');
  if (clip && lastPointer !== 'mouse') { e.preventDefault(); e.stopPropagation(); hideQuickPreview(); if (agFor === clip) hideGallery(); else showGallery(clip); return; }
  hideGallery();
  if (qpEl && qpEl.contains(e.target)) {
    const open = e.target.closest('[data-qp-open]');
    if (open && qpFor) { const row = qpFor; hideQuickPreview(); qpBypass = true; try { row.click(); } finally { qpBypass = false; } }
    return;
  }
  const row = qpRow(e.target);
  if (!qpBypass && quickPreviewOn() && row && lastPointer !== 'mouse' && row !== qpFor && !e.target.closest('dialog')) {
    e.preventDefault(); e.stopPropagation(); clearTimeout(qpTimer); showQuickPreview(row); return;
  }
  hideQuickPreview();
}, true);

// ---- 📎 gallery (t53u): hover (or tap on touch) the attachment icon for thumbnails, 3 at a time ----
// Images show as thumbnails; PDFs as a PDF tile with the file name (no PDF renderer is bundled).
// More than 3: ‹ › chevrons and horizontal scroll with snap. Clicking a thumbnail opens the file.
let agEl = null, agFor = null, agTimer = 0, agHide = 0;
function galleryFiles(key) {
  const [kind, id] = String(key).split(':'), doc = store.doc;
  if (kind === 'entry') return S.entryById(doc, id)?.attachments || [];
  if (kind === 'condition') { const c = doc.conditions.find(x => x.id === id); const all = [...(c?.attachments || []), ...doc.entries.filter(e => e.conditionId === id).flatMap(e => e.attachments || [])]; return [...new Map(all.map(a => [a.id, a])).values()]; }
  return [];
}
const isPdf = a => a.kind === 'pdf' || /\.pdf$/i.test(a.id || '');
function agPanel() {
  if (agEl) return agEl;
  agEl = document.createElement('div'); agEl.id = 'att-gallery'; agEl.className = 'ag-pop'; agEl.hidden = true; agEl.setAttribute('role', 'dialog'); agEl.setAttribute('aria-label', 'Attachments');
  agEl.addEventListener('mouseenter', () => clearTimeout(agHide));
  agEl.addEventListener('mouseleave', () => { if (lastPointer === 'mouse') scheduleGalleryHide(); });
  agEl.addEventListener('click', e => { const b = e.target.closest('[data-ag-dir]'); if (!b) return; e.preventDefault(); e.stopPropagation(); const tr = agEl.querySelector('.ag-track'); tr.scrollBy({ left: Number(b.dataset.agDir) * tr.clientWidth, behavior: 'smooth' }); });
  document.body.append(agEl);
  return agEl;
}
const scheduleGalleryHide = () => { clearTimeout(agHide); agHide = setTimeout(hideGallery, 200); };
export function hideGallery() { clearTimeout(agTimer); if (agEl) agEl.hidden = true; agFor = null; }
function agChevrons() {
  if (!agEl) return; const tr = agEl.querySelector('.ag-track'); if (!tr) return;
  const prev = agEl.querySelector('[data-ag-dir="-1"]'), next = agEl.querySelector('[data-ag-dir="1"]');
  if (prev) prev.disabled = tr.scrollLeft <= 2;
  if (next) next.disabled = tr.scrollLeft + tr.clientWidth >= tr.scrollWidth - 2;
}
function showGallery(icon) {
  const files = galleryFiles(icon.dataset.gallery); if (!files.length) return;
  const el = agPanel(), more = files.length > 3;
  el.innerHTML = `<div class="ag-head"><b>${esc(plural(files.length, 'attachment'))}</b>${more ? '<span class="ag-hint">scroll for more</span>' : ''}</div><div class="ag-body">${more ? '<button type="button" class="ag-nav" data-ag-dir="-1" aria-label="Previous attachments">‹</button>' : ''}<div class="ag-track">${files.map(a => `<button type="button" class="ag-item" data-action="view-file" data-id="${esc(a.id)}" data-name="${esc(a.name)}" data-kind="${isPdf(a) ? 'pdf' : 'image'}" title="Open ${esc(a.name)}">${isPdf(a) ? '<span class="ag-pdf" aria-hidden="true">PDF</span>' : `<img src="${esc(imageURL(a.id))}" alt="" loading="lazy">`}<span class="ag-name">${esc(a.name)}</span></button>`).join('')}</div>${more ? '<button type="button" class="ag-nav" data-ag-dir="1" aria-label="More attachments">›</button>' : ''}</div>`;
  el.hidden = false; agFor = icon;
  el.querySelector('.ag-track').addEventListener('scroll', agChevrons, { passive: true }); agChevrons();
  const r = icon.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  const left = Math.max(12, Math.min(r.left - 20, window.innerWidth - w - 12));
  const top = window.innerHeight - r.bottom >= h + 12 ? r.bottom + 6 : Math.max(12, r.top - h - 6);
  el.style.left = `${left + window.scrollX}px`; el.style.top = `${top + window.scrollY}px`;
}
document.addEventListener('mouseover', e => {
  if (lastPointer !== 'mouse') return;
  const icon = e.target.closest?.('[data-gallery]');
  if (icon) { clearTimeout(agHide); if (icon !== agFor) { clearTimeout(agTimer); agTimer = setTimeout(() => showGallery(icon), 150); } return; }
  if (agFor && !agEl?.contains(e.target)) { clearTimeout(agTimer); scheduleGalleryHide(); }
});
document.addEventListener('mouseout', e => { const icon = e.target.closest?.('[data-gallery]'); if (icon && !icon.contains(e.relatedTarget)) clearTimeout(agTimer); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && agEl && !agEl.hidden) hideGallery(); });
window.addEventListener('scroll', () => { if (agFor) hideGallery(); }, { passive: true });

export function eventRow(ev, { showCondition = true, compact = false } = {}) {
  const doc = store.doc, type = S.typeById(doc, ev.typeId), entry = S.entryById(doc, ev.entryId);
  const ic = entryIcons(entry), label = `${ev.label}: ${ev.title}, ${S.formatDate(ev.date)}${ic.label ? `; ${ic.label}` : ''}`, desc = ic.ids.length ? ` aria-describedby="${ic.ids.join(' ')}"` : '';
  if (compact) return `<li><button type="button" class="event compact" data-action="open-entry" data-id="${esc(ev.entryId)}" aria-label="${esc(label)}"${desc}>${dateBlock(ev.date)}<span class="event-main"><strong>${typeBadge(type, 'sm')} ${esc(ev.title)}</strong>${ic.html}<span class="meta"><span class="event-field">${esc(ev.primary ? type.singular : ev.label)}</span></span></span>${relLabel(ev.date, { time: eventTime(entry, ev) })}</button></li>`;
  return `<li><button type="button" class="event" data-action="open-entry" data-id="${esc(ev.entryId)}" aria-label="${esc(label)}"${desc}>${dateBlock(ev.date)}${typeBadge(type)}<span class="event-main"><strong>${esc(ev.title)}</strong>${ic.html}<span class="meta"><span class="event-field">${esc(ev.primary ? type.singular : ev.label)}</span>${showCondition ? `<span>${esc(conditionName(ev.conditionId))}</span>` : ''}${hhChip(entry)}${entrySummary(entry, type).slice(0, 2).map(b => `<span>${esc(b)}</span>`).join('')}${tagsFor(entry).map(tagChip).join('')}</span></span>${relLabel(ev.date, { time: eventTime(entry, ev) })}</button></li>`;
}
export function entryRow(entry) {
  const doc = store.doc, type = S.typeById(doc, entry.typeId), date = S.primaryDate(type, entry);
  const ic = entryIcons(entry);
  // The soonest future date (e.g. "Valid until", "Deadline") says more than a past primary date.
  const nextEv = S.entryEvents(doc, entry).filter(e => e.date >= S.today()).sort((a, b) => a.date.localeCompare(b.date))[0];
  const rel = nextEv ? `<span class="rel-wrap">${nextEv.primary ? '' : `<small>${esc(nextEv.label)}</small>`}${relLabel(nextEv.date, { time: eventTime(entry, nextEv) })}</span>` : date ? relLabel(date, { time: eventTime(entry, { primary: true }) }) : '';
  return `<li><button type="button" class="entry-row" data-action="open-entry" data-id="${esc(entry.id)}"${ic.ids.length ? ` aria-describedby="${ic.ids.join(' ')}"` : ''}>${typeBadge(type)}<span class="entry-main"><strong>${esc(entry.title)}</strong>${ic.html}<span class="meta">${date && nextEv && !nextEv.primary ? `<span>${esc(S.formatDate(date))}</span>` : ''}${hhChip(entry)}${entrySummary(entry, type).map(b => `<span>${esc(b)}</span>`).join('')}${tagsFor(entry).map(tagChip).join('')}</span></span>${rel}</button></li>`;
}
export function typeChip(type, count, pressed, action) {
  return `<button type="button" class="chip" data-action="${action}" data-id="${esc(type.id)}" aria-pressed="${pressed}">${typeBadge(type, 'sm')}${esc(type.name)}<span class="count">${count}</span></button>`;
}
export function tagFilterChip(tag, count, pressed, action) {
  return `<button type="button" class="chip text-only" data-action="${action}" data-id="${esc(tag.id)}" aria-pressed="${pressed}"><span class="tag" style="--tag-color:${esc(tag.color)}"><i aria-hidden="true"></i>${esc(S.tagDisplayLabel(store.doc, tag))}</span><span class="count">${count}</span></button>`;
}

// ---- home health countdown -------------------------------------------------------------------
const WARN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/></svg>';
/** Compact "2 of 5 left" chip for list rows; null when the entry is not a home health authorization. */
export function hhChip(entry) {
  if (entry.typeId !== S.HH.auth) return '';
  const u = S.authUsage(store.doc, entry);
  if (u.state === 'superseded') return '<span class="hh-chip state-superseded">Continued</span>';
  return `<span class="hh-chip state-${u.state}">${u.attention ? WARN : ''}${u.left} of ${u.authorized} left${u.state === 'awaiting' ? ' · awaiting approval' : ''}</span>`;
}
/** Countdown panel: big count, a bar of used visits, the warning, and the visits that did not count. */
export function hhPanel(entry, { compact = false, showCondition = true } = {}) {
  const u = S.authUsage(store.doc, entry), msg = S.authMessage(u);
  const pct = u.authorized ? Math.min(100, Math.round((u.used / u.authorized) * 100)) : 0;
  const missed = Object.entries(u.notCounted);
  const title = compact ? `<button type="button" class="link hh-title" data-action="open-entry" data-id="${esc(entry.id)}">${esc(entry.title)}</button>${showCondition ? `<small class="muted">${esc(conditionName(entry.conditionId))}</small>` : ''}` : '';
  return `<div class="hh-panel state-${u.state}${compact ? ' compact' : ''}">${title}
    <p class="hh-count"><b>${u.left}</b> of ${u.authorized} authorized visit${u.authorized === 1 ? '' : 's'} left</p>
    <div class="hh-bar" role="img" aria-label="${u.used} of ${u.authorized} authorized visits used"><span style="width:${pct}%"></span></div>
    <p class="fine hh-used">${plural(u.used, 'completed visit')} counted${entry.values?.end ? ` · ends ${relLabel(entry.values.end)}` : ''}</p>
    ${msg ? `<p class="hh-alert" role="${u.attention ? 'alert' : 'status'}">${u.attention ? WARN : ''}${esc(msg)}</p>` : ''}
    ${!compact && missed.length ? `<p class="fine hh-missed"><b>Not counted:</b> ${missed.map(([o, n]) => `${esc(o)} (${n})`).join(', ')}</p>` : ''}</div>`;
}

// ---- dialogs ---------------------------------------------------------------
export const editor = () => document.querySelector('#editor');
export function openDialog(html, bind = () => {}, { el = editor() } = {}) {
  el.innerHTML = html;
  el.dataset.dirty = '';
  if (!el.open) el.showModal();
  bind(el);
  el.querySelector('[autofocus]')?.focus();
  return el;
}
export function closeDialog(el = editor()) { if (el.open) el.close(); el.innerHTML = ''; }
export function dialogHead(title, eyebrow = '', badge = '') {
  return `<div class="dialog-head">${badge}<div>${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}<h2 id="dialog-title">${esc(title)}</h2></div><button type="button" class="close" data-close aria-label="Close">✕ Close</button></div>`;
}
document.addEventListener('click', e => { const c = e.target.closest('[data-close]'); if (c) closeDialog(c.closest('dialog')); });

// ---- every dialog: unsaved-edit guard for Esc and for a click outside the box (t46u) -------
// A form edit marks the dialog dirty; closing it with Esc or a backdrop click then asks first.
// A backdrop close needs the press AND the release outside the box, so a text selection dragged
// from inside the dialog to outside never closes it.
const outsideBox = (el, e) => { const r = el.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
const discardOk = el => el.dataset.dirty !== '1' || confirm('Discard your unsaved changes?');
document.addEventListener('input', e => { const d = e.target.closest?.('dialog'); if (d && e.target.closest('form')) d.dataset.dirty = '1'; }, true);
document.addEventListener('change', e => { const d = e.target.closest?.('dialog'); if (d && e.target.closest('form')) d.dataset.dirty = '1'; }, true);
document.addEventListener('cancel', e => { const d = e.target; if (d.tagName === 'DIALOG' && !discardOk(d)) e.preventDefault(); }, true);
document.addEventListener('close', e => { if (e.target.tagName === 'DIALOG') e.target.dataset.dirty = ''; }, true);
let pressedOutside = null;
document.addEventListener('pointerdown', e => { const d = e.target.tagName === 'DIALOG' ? e.target : null; pressedOutside = d && d.open && outsideBox(d, e) ? d : null; }, true);
document.addEventListener('click', e => {
  const d = pressedOutside; pressedOutside = null;
  if (!d || e.target !== d || !outsideBox(d, e) || !d.open) return;
  if (discardOk(d)) closeDialog(d);
}, true);
