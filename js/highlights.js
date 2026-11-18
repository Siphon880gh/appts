// Clinical Significance: per-condition progressive highlights (t67u). On the condition page it is a
// compact bar ("Clinical significance · N"), collapsed by default; expanding it docks a panel to the
// bottom of the viewport (closable, scrolls, taller/shorter toggle, both states remembered on this
// device). Key phrases in a highlight are links to the entry they come from: clicking one scrolls the
// condition page to that entry (clearing filters if they hide it) and flashes it. The panel is inset
// from the left so the bottom-left corner stays clear for the shared "Add / edit with AI" button.
// Records live in doc.highlights and sync like any other record (offline queue + merge).
import * as S from './schema.js';
import * as D from './documents.js';
import { store, save, put, remove, notice } from './store.js';
import { esc, openDialog, closeDialog, dialogHead, relLabel } from './ui.js';

const OPEN_KEY = 'appts.cs.open', TALL_KEY = 'appts.cs.tall';
const ls = { get: k => { try { return localStorage.getItem(k) === '1'; } catch { return false; } }, set: (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch {} } };
export const csOpen = () => ls.get(OPEN_KEY);
const textHTML = (t, links) => String(t || '').split(/\n{2,}/).map(p => `<p>${linkify(p, links).replace(/\n/g, '<br>')}</p>`).join('');

/** Escape text and turn each key phrase (first occurrence, longest phrases first) into a jump link. */
export function linkify(text, links) {
  text = String(text || '');
  const list = (links || []).filter(l => l && l.text && l.entryId).sort((a, b) => b.text.length - a.text.length);
  const hits = [];
  for (const l of list) {
    const i = text.toLowerCase().indexOf(l.text.toLowerCase());
    if (i < 0 || hits.some(h => i < h.end && i + l.text.length > h.start)) continue;
    hits.push({ start: i, end: i + l.text.length, entryId: l.entryId });
  }
  hits.sort((a, b) => a.start - b.start);
  let out = '', at = 0;
  for (const h of hits) {
    out += esc(text.slice(at, h.start)) + `<button type="button" class="cs-jump" data-action="cs-jump" data-id="${esc(h.entryId)}" title="Show this in the timeline">${esc(text.slice(h.start, h.end))}</button>`;
    at = h.end;
  }
  return out + esc(text.slice(at));
}

function flags(h) {
  return `${h.certainty && h.certainty !== 'documented' ? `<span class="cs-flag ${esc(h.certainty)}">${h.certainty === 'uncertain' ? '⚑ ' : ''}${esc(S.HIGHLIGHT_CERTAINTY[h.certainty] || h.certainty)}</span>` : ''}${h.origin === 'ai' ? '<span class="cs-flag ai" title="Written by an AI from the reports; check against the source">AI-drafted</span>' : ''}`;
}

function sourceLinks(doc, h) {
  const out = [];
  if (h.sourceEntryId) {
    const e = S.entryById(doc, h.sourceEntryId), t = e && S.typeById(doc, e.typeId);
    out.push(e ? `<li><span class="muted">Entry</span> <button type="button" class="link" data-action="open-entry" data-id="${esc(e.id)}">${esc(t?.singular || 'Entry')}: ${esc(e.title)}</button> <button type="button" class="link cs-goto" data-action="cs-jump" data-id="${esc(e.id)}">Show in timeline</button></li>` : '<li class="muted">Source entry was deleted.</li>');
  }
  if (h.sourceFileId) {
    const f = D.documentList(doc).find(d => d.file.id === h.sourceFileId);
    out.push(f ? `<li><span class="muted">Document</span> <button type="button" class="link" data-action="view-file" data-id="${esc(f.file.id)}" data-name="${esc(f.file.name)}" data-kind="${f.kind}">${f.kind === 'pdf' ? 'PDF' : 'Image'}: ${esc(f.file.name)}</button></li>` : '<li class="muted">Source document is no longer attached.</li>');
  }
  return out.length ? `<h4>Sources</h4><ul class="cs-sources">${out.join('')}</ul>` : '';
}

function itemHTML(doc, h) {
  const more = h.detail || h.quote || h.sourceEntryId || h.sourceFileId;
  return `<li class="cs-hl" data-highlight="${esc(h.id)}"><div class="cs-hl-head"><strong class="cs-title">${esc(h.title)}</strong>${h.date ? ` <span class="cs-date">${esc(S.formatDate(h.date))}</span>` : ''}<span class="cs-meta">${flags(h)}<button type="button" class="link cs-edit" data-action="edit-highlight" data-id="${esc(h.id)}" aria-label="Edit highlight ${esc(h.title)}">Edit</button></span></div>
    <p class="cs-sum">${linkify(h.summary, h.links)}</p>
    ${h.caveat ? `<div class="cs-caveat" role="note"><strong>Check:</strong> ${textHTML(h.caveat, h.links)}</div>` : ''}
    ${more ? `<details class="cs-more"><summary>Detail and sources</summary>${h.detail ? `<div class="cs-detail">${textHTML(h.detail, h.links)}</div>` : ''}${h.quote ? `<h4>From the report</h4><blockquote class="cs-quote">${textHTML(h.quote)}</blockquote>` : ''}${sourceLinks(doc, h)}</details>` : ''}</li>`;
}

/** The collapsed bar on a condition page, plus the bottom panel when expanded. */
export function highlightsHTML(doc, condition) {
  const list = S.highlightsFor(doc, condition.id);
  document.documentElement.classList.toggle('cs-open', false);
  if (!list.length) return ''; // t59u: no empty "Clinical significance 0"; add one from the condition's actions
  const open = csOpen(), tall = ls.get(TALL_KEY);
  document.documentElement.classList.toggle('cs-open', open);
  const bar = `<section class="cs-bar" id="cs" aria-label="Clinical significance"><button type="button" class="cs-bar-btn" data-action="cs-toggle" aria-expanded="${open}" aria-controls="cs-panel"><span class="cs-bar-title">Clinical significance</span> <span class="cs-count">· ${list.length}</span><span class="cs-chev" aria-hidden="true">${open ? '▾' : '▸'}</span></button><button type="button" class="link" data-action="add-highlight" data-id="${esc(condition.id)}">+ Add highlight</button></section>`;
  if (!open) return bar;
  return bar + `<section class="cs-panel${tall ? ' tall' : ''}" id="cs-panel" role="region" aria-labelledby="cs-panel-h">
    <div class="cs-panel-head"><h2 id="cs-panel-h">Clinical significance <small>${list.length}</small></h2><span class="cs-hint muted">Click an underlined phrase to jump to its entry.</span>
      <span class="cs-panel-actions"><button type="button" data-action="add-highlight" data-id="${esc(condition.id)}">+ Add</button><button type="button" data-action="cs-size" aria-pressed="${tall}" title="${tall ? 'Make the panel shorter' : 'Make the panel taller'}">${tall ? '▾ Shorter' : '▴ Taller'}</button><button type="button" class="close" data-action="cs-toggle" aria-label="Close Clinical significance">✕</button></span></div>
    <ol class="cs-list">${list.map(h => itemHTML(doc, h)).join('')}</ol></section>`;
}
export function toggleHighlights() { ls.set(OPEN_KEY, !csOpen()); }
export function toggleHighlightSize() { ls.set(TALL_KEY, !ls.get(TALL_KEY)); }
export function closeHighlights() { ls.set(OPEN_KEY, false); }

/** Scroll the condition page to an entry and flash it. Returns false if it is not on this page. */
export function flashEntry(entryId) {
  const row = document.querySelector(`.workspace .entry-row[data-id="${CSS.escape(entryId)}"]`);
  if (!row) return false;
  const top = row.getBoundingClientRect().top + window.scrollY - 96;
  window.scrollTo({ top: Math.max(0, top), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  row.classList.remove('cs-flash'); void row.offsetWidth; row.classList.add('cs-flash');
  setTimeout(() => row.classList.remove('cs-flash'), 2600);
  return true;
}

/** Old links to a single highlight open the panel at it. */
export function openHighlight(id) {
  const h = (store.doc.highlights || []).find(x => x.id === id);
  if (!h) return notice('That highlight was deleted.');
  ls.set(OPEN_KEY, true); store.render?.();
  document.querySelector(`#cs-panel [data-highlight="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
}

/** Add or edit a highlight (all plain text; the server sanitizes and validates again). */
export function openHighlightForm(h, conditionId) {
  const doc = store.doc, condId = h?.conditionId || conditionId;
  const entries = doc.entries.filter(e => e.conditionId === condId).sort((a, b) => a.title.localeCompare(b.title));
  const files = D.documentList(doc).filter(d => (d.conditionIds || [d.conditionId]).includes(condId));
  const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
  const html = `<form novalidate>${dialogHead(h ? 'Edit highlight' : 'Add a highlight', 'Clinical significance')}<div class="dialog-body"><div class="field-grid">
    <div class="wide"><label for="h-title">Title <span class="req" aria-hidden="true">*</span></label><input id="h-title" name="title" required maxlength="160" value="${esc(h?.title)}" placeholder="e.g. CT Left Foot (October 11, 2026)" autofocus></div>
    <div class="wide"><label for="h-summary">One-line summary <span class="req" aria-hidden="true">*</span></label><textarea id="h-summary" name="summary" rows="2" maxlength="600" required>${esc(h?.summary)}</textarea></div>
    <div><label for="h-date">Date</label><input id="h-date" type="date" name="date" value="${esc(h?.date)}"></div>
    <div><label for="h-cert">Certainty</label><select id="h-cert" name="certainty">${Object.entries(S.HIGHLIGHT_CERTAINTY).map(([v, l]) => opt(v, l, h?.certainty || 'documented')).join('')}</select></div>
    <div class="wide"><label for="h-detail">Detail <small class="muted">— shown under “Detail and sources”</small></label><textarea id="h-detail" name="detail" rows="5" maxlength="8000">${esc(h?.detail)}</textarea></div>
    <div class="wide"><label for="h-quote">Exact words from the report</label><textarea id="h-quote" name="quote" rows="3" maxlength="3000">${esc(h?.quote)}</textarea></div>
    <div class="wide"><label for="h-caveat">Check / uncertainty</label><textarea id="h-caveat" name="caveat" rows="2" maxlength="2000">${esc(h?.caveat)}</textarea></div>
    <div><label for="h-entry">Source entry</label><select id="h-entry" name="sourceEntryId">${opt('', '— none —', h?.sourceEntryId || '')}${entries.map(e => opt(e.id, e.title, h?.sourceEntryId || '')).join('')}</select></div>
    <div class="wide"><span class="field-label">Key phrase links <small class="muted">— a phrase from the summary or detail that jumps to an entry</small></span><div class="cs-links-ed">${(h?.links || []).map(l => linkRow(l, entries)).join('')}</div><button type="button" class="link" data-cs-addlink>+ Add a key phrase link</button></div>
    <div><label for="h-file">Source document</label><select id="h-file" name="sourceFileId">${opt('', '— none —', h?.sourceFileId || '')}${[...new Map(files.map(f => [f.file.id, f])).values()].map(f => opt(f.file.id, f.file.name, h?.sourceFileId || '')).join('')}</select></div>
    </div><p class="form-error" role="alert"></p></div><div class="dialog-foot"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save highlight</button></div></form>`;
  openDialog(html, el => {
    const form = el.querySelector('form');
    form.querySelector('[data-cs-addlink]').onclick = () => form.querySelector('.cs-links-ed').insertAdjacentHTML('beforeend', linkRow(null, entries));
    form.addEventListener('click', e => { const b = e.target.closest('[data-cs-dellink]'); if (b) { b.closest('.cs-link-row').remove(); el.dataset.dirty = '1'; } });
    form.onsubmit = async e => {
      e.preventDefault();
      const v = n => form.elements[n].value.trim();
      try {
        if (!v('title')) throw Error('Give the highlight a title.');
        if (!v('summary')) throw Error('Write the one-line summary.');
        const value = { ...(h || { id: S.newId('hl'), conditionId: condId, origin: 'manual', sortOrder: S.highlightsFor(doc, condId).length }), title: v('title'), summary: v('summary'), date: v('date'), certainty: v('certainty'), detail: v('detail'), quote: v('quote'), caveat: v('caveat'), sourceEntryId: v('sourceEntryId'), sourceFileId: v('sourceFileId'),
          links: [...form.querySelectorAll('.cs-link-row')].map(r => ({ text: r.querySelector('[data-l-text]').value.trim(), entryId: r.querySelector('[data-l-entry]').value })).filter(l => l.text && l.entryId) };
        await save([put('highlight', value)], h ? 'Highlight updated.' : 'Highlight added.');
        closeDialog(el);
      } catch (err) { form.querySelector('.form-error').textContent = err.message; }
    };
  });
}

function linkRow(l, entries) {
  return `<div class="cs-link-row"><input data-l-text aria-label="Key phrase" maxlength="200" placeholder="Phrase, e.g. 5mm nodular wound margin" value="${esc(l?.text)}"><select data-l-entry aria-label="Entry it jumps to"><option value="">— entry —</option>${entries.map(e => `<option value="${esc(e.id)}"${e.id === l?.entryId ? ' selected' : ''}>${esc(e.title)}</option>`).join('')}</select><button type="button" class="link" data-cs-dellink aria-label="Remove this link">Remove</button></div>`;
}

export async function deleteHighlight(id) {
  const h = (store.doc.highlights || []).find(x => x.id === id);
  if (!h || !confirm(`Delete the highlight “${h.title}”?`)) return;
  await save([remove('highlight', id)], 'Highlight deleted.');
}
