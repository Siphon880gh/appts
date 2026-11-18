// @mentions in rich notes: the libraries a note can point at (pure, Node-tested) and the caret popover.
// Typing @ opens Documents / Events / Notes; hovering (or →) a library lists its items; typing after
// @ filters every library at once. Choosing one inserts a chip <span class="mention" data-mention
// data-ref> that opens the document, entry, or condition when the note is read.
import { typeById, primaryDate, formatDate } from './schema.js';
import { documentList, labelById, KIND_NAMES } from './documents.js';

const fold = s => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const snippet = s => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > 70 ? `${t.slice(0, 69)}…` : t; };

/** Libraries for this account: documents (deduplicated by file), events (every entry), notes (records with note text). */
export function mentionLibraries(doc) {
  const condName = id => doc.conditions.find(c => c.id === id)?.name || '';
  const seen = new Map();
  for (const d of documentList(doc)) {
    if (seen.has(d.file.id)) continue;
    const label = labelById(doc, d.file.label).label;
    seen.set(d.file.id, { kind: 'file', ref: d.file.id, label: d.file.name, chip: `@${d.file.name}`, meta: `${label} · ${KIND_NAMES[d.kind]} · ${d.owner.title}`, fileKind: d.kind, search: fold(`${d.file.name} ${label} ${KIND_NAMES[d.kind]} ${d.owner.title} ${d.conditionName}`) });
  }
  const events = doc.entries.map(e => {
    const type = typeById(doc, e.typeId), date = primaryDate(type, e);
    return { kind: 'entry', ref: e.id, label: e.title, chip: `@${e.title}`, date, meta: [type?.singular, date && formatDate(date), condName(e.conditionId)].filter(Boolean).join(' · '), search: fold(`${e.title} ${type?.singular || ''} ${type?.name || ''} ${condName(e.conditionId)} ${date}`) };
  }).sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.label.localeCompare(b.label));
  const notes = [
    ...doc.conditions.filter(c => (c.notes?.text || '').trim()).map(c => ({ kind: 'condition', ref: c.id, label: c.name, chip: `@Notes: ${c.name}`, meta: snippet(c.notes.text), search: fold(`${c.name} ${c.notes.text}`) })),
    ...doc.entries.filter(e => (e.notes?.text || '').trim()).map(e => ({ kind: 'entry', ref: e.id, label: e.title, chip: `@Notes: ${e.title}`, meta: snippet(e.notes.text), search: fold(`${e.title} ${e.notes.text}`) })),
  ];
  return [
    { id: 'documents', label: 'Documents', hint: 'PDFs and images', items: [...seen.values()] },
    { id: 'events', label: 'Events', hint: 'Visits, insurance, disruptions…', items: events },
    { id: 'notes', label: 'Notes', hint: 'Notes already written', items: notes },
  ];
}

/** Every word typed after @ must appear (in the item or as the start of its library's name); library order, at most `limit`. */
export function filterMentions(libraries, query, limit = 30) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const out = [];
  // The library's own name counts too, so "@notes knee" narrows to notes about the knee.
  for (const lib of libraries) { const name = fold(lib.label); for (const item of lib.items) if (words.every(w => item.search.includes(w) || name.startsWith(w))) out.push({ ...item, library: lib.label }); }
  return out.slice(0, limit);
}

/** The "@query" just before the caret in a text node, or null. Needs start of text or a space before @. */
export function mentionTrigger(textBefore) {
  const m = /(^|[\s(\u00a0])@([^@\n]{0,40})$/.exec(textBefore);
  return m ? { query: m[2], start: textBefore.length - m[2].length - 1 } : null;
}

// ---- popover (browser only) --------------------------------------------------------------------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Attach the @ popover to a contenteditable body. getDoc() returns the current document; makeChip(item)
 * returns the chip node to insert; onChange() runs after an insert.
 */
export function bindMentions(body, { getDoc, makeChip, onChange = () => {} }) {
  const pop = document.createElement('div');
  pop.className = 'mention-pop'; pop.hidden = true; pop.setAttribute('role', 'menu'); pop.setAttribute('aria-label', 'Link a document, event, or note');
  body.after(pop);
  let state = null; // { node, start, query, libs, lib (open library index or -1), pane: 'libs'|'items'|'flat', active }

  function trigger() {
    const sel = getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return null;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE || !body.contains(node)) return null;
    const t = mentionTrigger(node.data.slice(0, sel.anchorOffset));
    return t ? { node, start: t.start, end: sel.anchorOffset, query: t.query } : null;
  }
  function close() { state = null; pop.hidden = true; pop.replaceChildren(); body.removeAttribute('aria-expanded'); }
  function place() {
    const r = document.createRange(); r.setStart(state.node, state.start); r.setEnd(state.node, Math.min(state.start + 1, state.node.length));
    const rect = r.getBoundingClientRect(), w = Math.min(560, innerWidth - 16);
    pop.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - w - 8))}px`;
    const below = rect.bottom + 6, h = Math.min(320, innerHeight / 2);
    pop.style.top = `${below + h > innerHeight && rect.top > h ? rect.top - h - 6 : below}px`;
    pop.style.maxWidth = `${w}px`;
  }
  const itemHTML = (it, i, active, showLib) => `<li role="menuitem" class="mention-item${i === active ? ' active' : ''}" data-i="${i}" id="mention-opt-${i}"><span class="mention-kind ${esc(it.kind === 'file' ? it.fileKind : it.kind)}" aria-hidden="true">${it.kind === 'file' ? (it.fileKind === 'pdf' ? 'PDF' : 'IMG') : it.chip.startsWith('@Notes') ? '¶' : '•'}</span><span><b>${esc(it.label)}</b><small>${showLib ? `${esc(it.library)} · ` : ''}${esc(it.meta)}</small></span></li>`;
  function items() {
    if (state.pane === 'flat') return state.flat;
    return state.lib >= 0 ? state.libs[state.lib].items.slice(0, 50) : [];
  }
  function render() {
    const { libs } = state;
    if (state.query.trim()) {
      state.pane = 'flat'; state.flat = filterMentions(libs, state.query);
      if (!state.flat.length) { pop.innerHTML = `<p class="mention-empty">Nothing matches “${esc(state.query)}”. Keep typing, or press Esc.</p>`; pop.hidden = false; place(); return; }
      state.active = Math.min(state.active, state.flat.length - 1);
      pop.innerHTML = `<ul class="mention-flat">${state.flat.map((it, i) => itemHTML(it, i, state.active, true)).join('')}</ul>`;
    } else {
      if (state.pane === 'flat') { state.pane = 'libs'; state.active = 0; state.lib = -1; }
      const list = state.lib >= 0 ? libs[state.lib].items.slice(0, 50) : [];
      pop.innerHTML = `<ul class="mention-libs">${libs.map((l, i) => `<li role="menuitem" aria-haspopup="menu" aria-expanded="${i === state.lib}" class="mention-lib${(state.pane === 'libs' && i === state.active) || i === state.lib ? ' active' : ''}" data-lib="${i}"><b>${esc(l.label)}</b><small>${l.items.length} · ${esc(l.hint)}</small><span aria-hidden="true">›</span></li>`).join('')}</ul>${state.lib >= 0 ? `<ul class="mention-items" role="menu" aria-label="${esc(libs[state.lib].label)}">${list.length ? list.map((it, i) => itemHTML(it, i, state.pane === 'items' ? state.active : -1, false)).join('') : `<li class="mention-empty">No ${esc(libs[state.lib].label.toLowerCase())} yet.</li>`}</ul>` : '<p class="mention-help">Point at a library, or type to search all of them.</p>'}`;
    }
    pop.hidden = false; body.setAttribute('aria-expanded', 'true'); place();
    pop.querySelector('.mention-item.active')?.scrollIntoView({ block: 'nearest' });
  }
  function open(t) {
    const fresh = !state;
    state = { ...(state || { lib: -1, pane: 'libs', active: 0 }), ...t, libs: fresh || !state.libs ? mentionLibraries(getDoc()) : state.libs };
    if (fresh) { state.active = 0; state.lib = -1; state.pane = 'libs'; }
    render();
  }
  function choose(item) {
    const sel = getSelection(), t = trigger();
    const node = t ? t.node : state.node, start = t ? t.start : state.start, end = t ? t.end : state.end;
    const range = document.createRange(); range.setStart(node, start); range.setEnd(node, end); range.deleteContents();
    const chip = makeChip(item), space = document.createTextNode('\u00a0');
    range.insertNode(space); range.insertNode(chip);
    const after = document.createRange(); after.setStartAfter(space); after.collapse(true); sel.removeAllRanges(); sel.addRange(after);
    close(); body.focus(); onChange();
  }
  body.addEventListener('input', () => { const t = trigger(); if (t) open(t); else close(); });
  body.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== body) close(); }, 150));
  body.addEventListener('keydown', e => {
    if (!state || pop.hidden) return;
    const list = items();
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = state.pane === 'libs' ? state.libs.length : list.length; if (!n) return;
      state.active = (state.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; render(); return;
    }
    if (e.key === 'ArrowRight' && state.pane === 'libs') { e.preventDefault(); state.lib = state.active; state.pane = 'items'; state.active = 0; render(); return; }
    if (e.key === 'ArrowLeft' && state.pane === 'items') { e.preventDefault(); state.active = state.lib; state.lib = -1; state.pane = 'libs'; render(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (state.pane === 'libs') { if (e.key === 'Enter') { e.preventDefault(); state.lib = state.active; state.pane = 'items'; state.active = 0; render(); } return; }
      if (list[state.active]) { e.preventDefault(); choose(list[state.active]); }
    }
  });
  pop.addEventListener('mousedown', e => e.preventDefault()); // keep the caret in the note
  pop.addEventListener('mouseover', e => {
    if (!state) return;
    const lib = e.target.closest('[data-lib]'), it = e.target.closest('.mention-item');
    if (lib && Number(lib.dataset.lib) !== state.lib) { state.lib = Number(lib.dataset.lib); state.pane = 'items'; state.active = -1; render(); }
    else if (it && Number(it.dataset.i) !== state.active) { pop.querySelector('.mention-item.active')?.classList.remove('active'); it.classList.add('active'); state.active = Number(it.dataset.i); }
  });
  pop.addEventListener('click', e => {
    if (!state) return;
    const lib = e.target.closest('[data-lib]'), it = e.target.closest('.mention-item');
    if (lib) { state.lib = Number(lib.dataset.lib); state.pane = 'items'; state.active = 0; render(); return; }
    if (it) { const item = items()[Number(it.dataset.i)]; if (item) choose(item); }
  });
  return { close, isOpen: () => !!state && !pop.hidden };
}
