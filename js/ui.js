// Shared rendering helpers. All user text goes through esc().
import * as S from './schema.js';
import { typeBadge } from './icons.js';
import { store } from './store.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
export const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';

export function searchBox(id, value, label, placeholder) {
  return `<div class="search"><label for="${id}" class="skip">${esc(label)}</label>${SEARCH_ICON}<input id="${id}" type="search" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off"></div>`;
}
export function tagChip(tag) {
  return tag ? `<span class="tag" style="--tag-color:${esc(tag.color || '#5c6674')}"><i aria-hidden="true"></i>${esc(tag.label)}</span>` : '';
}
export function tagsFor(entry) {
  return (entry.tagIds || []).map(id => store.doc.tags.find(t => t.id === id)).filter(Boolean);
}
export function relLabel(date) {
  const n = S.daysBetween(S.today(), date);
  return `<span class="rel ${n < 0 ? 'past' : n <= 7 ? 'soon' : ''}">${esc(S.relativeDay(date))}</span>`;
}
export function dateBlock(date) {
  const d = new Date(`${date}T12:00:00`);
  return `<span class="date-block" aria-hidden="true"><span>${d.toLocaleDateString(undefined, { month: 'short' })}</span><b>${d.getDate()}</b><span>${d.toLocaleDateString(undefined, { weekday: 'short' })}</span></span>`;
}
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
export function eventRow(ev, { showCondition = true, compact = false } = {}) {
  const doc = store.doc, type = S.typeById(doc, ev.typeId), entry = S.entryById(doc, ev.entryId);
  const label = `${ev.label}: ${ev.title}, ${S.formatDate(ev.date)}`;
  if (compact) return `<li><button type="button" class="event compact" data-action="open-entry" data-id="${esc(ev.entryId)}" aria-label="${esc(label)}">${dateBlock(ev.date)}<span class="event-main"><strong>${typeBadge(type, 'sm')} ${esc(ev.title)}</strong><span class="meta"><span class="event-field">${esc(ev.primary ? type.singular : ev.label)}</span>${relLabel(ev.date)}</span></span></button></li>`;
  return `<li><button type="button" class="event" data-action="open-entry" data-id="${esc(ev.entryId)}" aria-label="${esc(label)}">${dateBlock(ev.date)}${typeBadge(type)}<span class="event-main"><strong>${esc(ev.title)}</strong><span class="meta"><span class="event-field">${esc(ev.primary ? type.singular : ev.label)}</span>${showCondition ? `<span>${esc(conditionName(ev.conditionId))}</span>` : ''}${hhChip(entry)}${entrySummary(entry, type).slice(0, 2).map(b => `<span>${esc(b)}</span>`).join('')}${tagsFor(entry).map(tagChip).join('')}</span></span>${relLabel(ev.date)}</button></li>`;
}
export function entryRow(entry) {
  const doc = store.doc, type = S.typeById(doc, entry.typeId), date = S.primaryDate(type, entry);
  const docs = (entry.attachments || []).length;
  // The soonest future date (e.g. "Valid until", "Deadline") says more than a past primary date.
  const nextEv = S.entryEvents(doc, entry).filter(e => e.date >= S.today()).sort((a, b) => a.date.localeCompare(b.date))[0];
  const rel = nextEv ? `<span class="rel-wrap">${nextEv.primary ? '' : `<small>${esc(nextEv.label)}</small>`}${relLabel(nextEv.date)}</span>` : date ? relLabel(date) : '';
  return `<li><button type="button" class="entry-row" data-action="open-entry" data-id="${esc(entry.id)}">${typeBadge(type)}<span class="entry-main"><strong>${esc(entry.title)}</strong><span class="meta">${date ? `<span>${esc(S.formatDate(date))}</span>` : ''}${nextEv && !nextEv.primary ? `<span><b>${esc(nextEv.label)} ${esc(S.formatDate(nextEv.date, { month: 'short', day: 'numeric' }))}</b></span>` : ''}${hhChip(entry)}${entrySummary(entry, type).map(b => `<span>${esc(b)}</span>`).join('')}${docs ? `<span>${plural(docs, 'document')}</span>` : ''}${tagsFor(entry).map(tagChip).join('')}</span></span>${rel}</button></li>`;
}
export function typeChip(type, count, pressed, action) {
  return `<button type="button" class="chip" data-action="${action}" data-id="${esc(type.id)}" aria-pressed="${pressed}">${typeBadge(type, 'sm')}${esc(type.name)}<span class="count">${count}</span></button>`;
}
export function tagFilterChip(tag, count, pressed, action) {
  return `<button type="button" class="chip text-only" data-action="${action}" data-id="${esc(tag.id)}" aria-pressed="${pressed}"><span class="tag" style="--tag-color:${esc(tag.color)}"><i aria-hidden="true"></i>${esc(tag.label)}</span><span class="count">${count}</span></button>`;
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
    <p class="fine hh-used">${plural(u.used, 'completed visit')} counted${entry.values?.end ? ` · ends ${esc(S.formatDate(entry.values.end, { month: 'short', day: 'numeric' }))}` : ''}</p>
    ${msg ? `<p class="hh-alert" role="${u.attention ? 'alert' : 'status'}">${u.attention ? WARN : ''}${esc(msg)}</p>` : ''}
    ${!compact && missed.length ? `<p class="fine hh-missed"><b>Not counted:</b> ${missed.map(([o, n]) => `${esc(o)} (${n})`).join(', ')}</p>` : ''}</div>`;
}

// ---- dialogs ---------------------------------------------------------------
export const editor = () => document.querySelector('#editor');
export function openDialog(html, bind = () => {}, { el = editor() } = {}) {
  el.innerHTML = html;
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
