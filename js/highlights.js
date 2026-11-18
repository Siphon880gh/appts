// Clinical Significance: per-condition progressive highlights. The list shows one short line per
// highlight; a highlight with more to show (detail, exact quote, caveat, sources) opens a right-side
// drawer. Records live in doc.highlights and sync like any other record (offline queue + merge).
// The bottom-left corner stays clear for the shared "Add / edit with AI" button (js/harness-ai.js).
import * as S from './schema.js';
import * as D from './documents.js';
import { store, save, put, remove, notice } from './store.js';
import { esc, openDialog, closeDialog, dialogHead, relLabel } from './ui.js';

const SHOW_FIRST = 5;
const expanded = new Set();
const textHTML = t => String(t || '').split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');

function drawer() {
  let el = document.querySelector('#cs-drawer');
  if (!el) {
    el = document.createElement('dialog'); el.id = 'cs-drawer'; el.className = 'drawer'; el.setAttribute('aria-labelledby', 'dialog-title');
    document.body.appendChild(el);
  }
  return el;
}

function flags(h) {
  return `${h.certainty && h.certainty !== 'documented' ? `<span class="cs-flag ${esc(h.certainty)}">${h.certainty === 'uncertain' ? '⚑ ' : ''}${esc(S.HIGHLIGHT_CERTAINTY[h.certainty] || h.certainty)}</span>` : ''}${h.origin === 'ai' ? '<span class="cs-flag ai" title="Written by an AI from the reports; check against the source">AI-drafted</span>' : ''}`;
}

/** The section on a condition page. */
export function highlightsHTML(doc, condition) {
  const list = S.highlightsFor(doc, condition.id), open = expanded.has(condition.id);
  if (!list.length) return ''; // t59u: no empty "Clinical significance 0" panel; add one from the condition's actions
  const shown = open ? list : list.slice(0, SHOW_FIRST);
  const item = h => {
    const inner = `<span class="cs-line"><strong class="cs-title">${esc(h.title)}</strong> <span class="cs-sum">${esc(h.summary)}</span></span><span class="cs-meta">${flags(h)}${S.highlightHasMore(h) ? '<span class="cs-more" aria-hidden="true">Details ›</span>' : ''}</span>`;
    return `<li data-highlight="${esc(h.id)}">${S.highlightHasMore(h) ? `<button type="button" class="cs-item" data-action="open-highlight" data-id="${esc(h.id)}" aria-haspopup="dialog">${inner}</button>` : `<div class="cs-item">${inner}<button type="button" class="link cs-edit" data-action="edit-highlight" data-id="${esc(h.id)}" aria-label="Edit highlight ${esc(h.title)}">Edit</button></div>`}</li>`;
  };
  return `<section class="cs" id="cs" aria-labelledby="cs-h"><div class="section-heading"><h2 id="cs-h">Clinical significance <small>${list.length}</small></h2><button type="button" data-action="add-highlight" data-id="${esc(condition.id)}">+ Add highlight</button></div>
    ${list.length ? `<ol class="cs-list">${shown.map(item).join('')}</ol>${list.length > SHOW_FIRST ? `<button type="button" class="link cs-toggle" data-action="cs-toggle" data-id="${esc(condition.id)}" aria-expanded="${open}">${open ? 'Show fewer' : `Show all ${list.length} highlights`}</button>` : ''}`
      : '<p class="muted cs-empty">No highlights yet. An AI can draft them from this condition’s reports (see the clinical-significance skill), or add one yourself.</p>'}</section>`;
}
export function toggleHighlights(conditionId) { if (expanded.has(conditionId)) expanded.delete(conditionId); else expanded.add(conditionId); }

function sourceLinks(doc, h) {
  const out = [];
  if (h.sourceEntryId) {
    const e = S.entryById(doc, h.sourceEntryId), t = e && S.typeById(doc, e.typeId);
    out.push(e ? `<li><span class="muted">Entry</span> <button type="button" class="link" data-action="open-entry" data-id="${esc(e.id)}">${esc(t?.singular || 'Entry')}: ${esc(e.title)}</button></li>` : '<li class="muted">Source entry was deleted.</li>');
  }
  if (h.sourceFileId) {
    const f = D.documentList(doc).find(d => d.file.id === h.sourceFileId);
    out.push(f ? `<li><span class="muted">Document</span> <button type="button" class="link" data-action="view-file" data-id="${esc(f.file.id)}" data-name="${esc(f.file.name)}" data-kind="${f.kind}">${f.kind === 'pdf' ? 'PDF' : 'Image'}: ${esc(f.file.name)}</button></li>` : '<li class="muted">Source document is no longer attached.</li>');
  }
  return out.length ? `<h3>Sources</h3><ul class="cs-sources">${out.join('')}</ul>` : '';
}

/** The right-side drawer with the full detail of one highlight. */
export function openHighlight(id) {
  const doc = store.doc, h = (doc.highlights || []).find(x => x.id === id);
  if (!h) return notice('That highlight was deleted.');
  const html = `${dialogHead(h.title, 'Clinical significance')}<div class="dialog-body cs-body">
    ${h.date ? `<p class="cs-date">${relLabel(h.date)}</p>` : ''}<p class="cs-summary">${esc(h.summary)}</p><p class="cs-flags">${flags(h)}</p>
    ${h.caveat ? `<div class="cs-caveat" role="note"><strong>Check:</strong> ${textHTML(h.caveat)}</div>` : ''}
    ${h.detail ? `<h3>Detail</h3><div class="cs-detail">${textHTML(h.detail)}</div>` : ''}
    ${h.quote ? `<h3>From the report</h3><blockquote class="cs-quote">${textHTML(h.quote)}</blockquote>` : ''}
    ${sourceLinks(doc, h)}</div>
    <div class="dialog-foot"><div class="left"><button type="button" class="danger" data-action="delete-highlight" data-id="${esc(h.id)}">Delete</button></div><button type="button" data-action="edit-highlight" data-id="${esc(h.id)}">Edit</button><button type="button" class="primary" data-close>Done</button></div>`;
  openDialog(html, () => {}, { el: drawer() });
}

/** Add or edit a highlight (all plain text; the server sanitizes and validates again). */
export function openHighlightForm(h, conditionId) {
  const doc = store.doc, condId = h?.conditionId || conditionId;
  closeDialog(drawer());
  const entries = doc.entries.filter(e => e.conditionId === condId).sort((a, b) => a.title.localeCompare(b.title));
  const files = D.documentList(doc).filter(d => d.conditionId === condId);
  const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
  const html = `<form novalidate>${dialogHead(h ? 'Edit highlight' : 'Add a highlight', 'Clinical significance')}<div class="dialog-body"><div class="field-grid">
    <div class="wide"><label for="h-title">Title <span class="req" aria-hidden="true">*</span></label><input id="h-title" name="title" required maxlength="160" value="${esc(h?.title)}" placeholder="e.g. CT Left Foot (October 11, 2026)" autofocus></div>
    <div class="wide"><label for="h-summary">One-line summary <span class="req" aria-hidden="true">*</span></label><textarea id="h-summary" name="summary" rows="2" maxlength="600" required>${esc(h?.summary)}</textarea></div>
    <div><label for="h-date">Date</label><input id="h-date" type="date" name="date" value="${esc(h?.date)}"></div>
    <div><label for="h-cert">Certainty</label><select id="h-cert" name="certainty">${Object.entries(S.HIGHLIGHT_CERTAINTY).map(([v, l]) => opt(v, l, h?.certainty || 'documented')).join('')}</select></div>
    <div class="wide"><label for="h-detail">Detail <small class="muted">— shown in the side panel</small></label><textarea id="h-detail" name="detail" rows="5" maxlength="8000">${esc(h?.detail)}</textarea></div>
    <div class="wide"><label for="h-quote">Exact words from the report</label><textarea id="h-quote" name="quote" rows="3" maxlength="3000">${esc(h?.quote)}</textarea></div>
    <div class="wide"><label for="h-caveat">Check / uncertainty</label><textarea id="h-caveat" name="caveat" rows="2" maxlength="2000">${esc(h?.caveat)}</textarea></div>
    <div><label for="h-entry">Source entry</label><select id="h-entry" name="sourceEntryId">${opt('', '— none —', h?.sourceEntryId || '')}${entries.map(e => opt(e.id, e.title, h?.sourceEntryId || '')).join('')}</select></div>
    <div><label for="h-file">Source document</label><select id="h-file" name="sourceFileId">${opt('', '— none —', h?.sourceFileId || '')}${[...new Map(files.map(f => [f.file.id, f])).values()].map(f => opt(f.file.id, f.file.name, h?.sourceFileId || '')).join('')}</select></div>
    </div><p class="form-error" role="alert"></p></div><div class="dialog-foot"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save highlight</button></div></form>`;
  openDialog(html, el => {
    const form = el.querySelector('form');
    form.onsubmit = async e => {
      e.preventDefault();
      const v = n => form.elements[n].value.trim();
      try {
        if (!v('title')) throw Error('Give the highlight a title.');
        if (!v('summary')) throw Error('Write the one-line summary.');
        const value = { ...(h || { id: S.newId('hl'), conditionId: condId, origin: 'manual', sortOrder: S.highlightsFor(doc, condId).length }), title: v('title'), summary: v('summary'), date: v('date'), certainty: v('certainty'), detail: v('detail'), quote: v('quote'), caveat: v('caveat'), sourceEntryId: v('sourceEntryId'), sourceFileId: v('sourceFileId') };
        await save([put('highlight', value)], h ? 'Highlight updated.' : 'Highlight added.');
        closeDialog(el);
      } catch (err) { form.querySelector('.form-error').textContent = err.message; }
    };
  });
}

export async function deleteHighlight(id) {
  const h = (store.doc.highlights || []).find(x => x.id === id);
  if (!h || !confirm(`Delete the highlight “${h.title}”?`)) return;
  await save([remove('highlight', id)], 'Highlight deleted.');
  closeDialog(drawer());
}
