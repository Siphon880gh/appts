// Entry and condition forms, rendered from entry-type definitions; tag picker; document zone;
// entry detail with links and backlinks; inline file viewer.
import * as S from './schema.js';
import * as D from './documents.js';
import { typeBadge } from './icons.js';
import { richEditor, bindEditor, editorValue, noteHTML } from './richText.js';
import { pdfThumbHTML } from './pdfThumbs.js';
import { uploadFile, documentFiles, fileURL, imageURL, DOCUMENT_ACCEPT } from './images.js';
import { store, save, put, remove, notice } from './store.js';
import { esc, condOptionAttrs, openDialog, closeDialog, dialogHead, tagChip, tagsFor, conditionName, plural, relLabel, eventTime, hhPanel } from './ui.js';

// ---- tag picker: chips + type-ahead; Enter or "+ Create" makes a tag on the fly ----------
export function tagPickerHTML(id) {
  return `<div class="tag-picker" id="${id}"><span class="field-label" id="${id}-label">Tags</span><div class="picked" aria-live="polite"></div><input type="text" aria-labelledby="${id}-label" placeholder="Add a tag… (Enter creates a new one)" autocomplete="off" maxlength="40"><div class="tag-options" role="listbox" hidden></div></div>`;
}
export function bindTagPicker(root, selectedIds = []) {
  const doc = store.doc, input = root.querySelector('input'), picked = root.querySelector('.picked'), options = root.querySelector('.tag-options');
  const state = { selected: selectedIds.map(id => doc.tags.find(t => t.id === id)).filter(Boolean), created: [] };
  const draw = () => {
    picked.innerHTML = state.selected.map(t => `<button type="button" data-tag="${esc(t.id)}" aria-label="Remove ${esc(t.label)} tag">${tagChip(t)} ×</button>`).join('');
    picked.querySelectorAll('button').forEach(b => b.onclick = () => { state.selected = state.selected.filter(t => t.id !== b.dataset.tag); draw(); input.focus(); });
  };
  const choose = tag => { if (!state.selected.some(t => t.id === tag.id)) state.selected.push(tag); input.value = ''; options.hidden = true; draw(); input.focus(); };
  const create = () => {
    const found = S.findOrCreateTag(doc, input.value, state.created); if (!found) return;
    if (found.created) state.created.push(found.tag);
    choose(found.tag);
  };
  const drawOptions = () => {
    const term = input.value.trim().toLowerCase();
    const all = [...doc.tags, ...state.created].filter(t => !state.selected.some(s => s.id === t.id) && t.label.toLowerCase().includes(term));
    options.innerHTML = all.slice(0, 12).map(t => `<button type="button" role="option" data-tag="${esc(t.id)}">${tagChip(t)}</button>`).join('')
      + (term && ![...doc.tags, ...state.created].some(t => t.label.toLowerCase() === term) ? `<button type="button" data-create>+ Create “${esc(input.value.trim())}”</button>` : '');
    options.hidden = !options.innerHTML;
    options.querySelectorAll('[data-tag]').forEach(b => b.onmousedown = e => { e.preventDefault(); choose([...doc.tags, ...state.created].find(t => t.id === b.dataset.tag)); });
    options.querySelector('[data-create]')?.addEventListener('mousedown', e => { e.preventDefault(); create(); });
  };
  input.oninput = drawOptions; input.onfocus = drawOptions;
  input.onblur = () => setTimeout(() => { options.hidden = true; }, 120);
  input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); create(); } if (e.key === 'Escape' && !options.hidden) { e.stopPropagation(); e.preventDefault(); options.hidden = true; } };
  draw();
  return () => { if (input.value.trim()) create(); return { tagIds: state.selected.map(t => t.id), newTags: state.created.filter(t => state.selected.some(s => s.id === t.id)) }; };
}

// ---- document zone: picker, drag-drop, paste; each file gets a label (custom on the fly) ----
export function docZoneHTML(id) {
  return `<div class="doc-zone" id="${id}" data-uploading="false"><div class="zone-head"><span><strong>Documents &amp; photos</strong> · Drop PDFs or images here, paste with Ctrl/⌘+V, or</span><button type="button" data-pick>Choose files…</button><input type="file" accept="${DOCUMENT_ACCEPT}" multiple hidden></div><ul class="doc-items"></ul><p class="upload-status" role="status"></p><datalist id="${id}-labels"></datalist></div>`;
}
function previewHTML(a, cls = 'thumb') {
  return D.fileKind(a) === 'pdf' ? pdfThumbHTML(a.id, `<span class="pdf-tile" aria-hidden="true">PDF</span>`) : `<img class="${cls}" src="${esc(imageURL(a.id))}" alt="" loading="lazy">`;
}
export function bindDocZone(root, attachments = [], defaultLabel = () => 'other') {
  const doc = store.doc, list = root.querySelector('.doc-items'), status = root.querySelector('.upload-status'), file = root.querySelector('input[type=file]');
  const datalist = root.querySelector('datalist');
  const state = { items: attachments.map(a => ({ ...a, labelText: D.labelById(doc, a.label).label })), pending: 0 };
  datalist.innerHTML = (doc.docLabels || []).map(l => `<option value="${esc(l.label)}">`).join('');
  const draw = () => {
    list.innerHTML = state.items.map((a, i) => `<li class="doc-item">${previewHTML(a)}<span><strong>${esc(a.name)}</strong><br><small class="muted">${D.KIND_NAMES[D.fileKind(a)]}${a.bytes ? ` · ${D.formatBytes(a.bytes)}` : ''}</small></span><label>Label<input data-label="${i}" list="${datalist.id}" value="${esc(a.labelText)}" maxlength="40" aria-label="Document label for ${esc(a.name)}"></label><button type="button" data-remove="${i}" aria-label="Remove ${esc(a.name)}">Remove</button></li>`).join('');
    list.querySelectorAll('[data-label]').forEach(inp => inp.oninput = () => { state.items[inp.dataset.label].labelText = inp.value; });
    list.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => { state.items.splice(Number(b.dataset.remove), 1); draw(); });
  };
  async function add(files) {
    if (!files.length) return;
    state.pending++; root.dataset.uploading = 'true'; status.textContent = `Uploading ${plural(files.length, 'file')}…`;
    try {
      for (const f of files) {
        const stored = await uploadFile(f);
        if (!state.items.some(a => a.id === stored.id)) state.items.push({ id: stored.id, name: stored.name || f.name || 'Upload', mime: stored.mime, kind: stored.kind, bytes: stored.bytes, addedAt: new Date().toISOString(), labelText: D.labelById(doc, defaultLabel()).label });
      }
      status.textContent = 'Uploaded. Pick a label for each file, then save.'; draw();
    } catch (err) { status.textContent = err.message; }
    finally { state.pending--; root.dataset.uploading = state.pending ? 'true' : 'false'; }
  }
  root.querySelector('[data-pick]').onclick = () => file.click();
  file.onchange = () => { add([...file.files]); file.value = ''; };
  root.addEventListener('dragover', e => { e.preventDefault(); root.classList.add('dragging'); });
  root.addEventListener('dragleave', () => root.classList.remove('dragging'));
  root.addEventListener('drop', e => { e.preventDefault(); root.classList.remove('dragging'); add(documentFiles(e.dataTransfer)); });
  draw();
  return {
    add,
    value() {
      if (root.dataset.uploading === 'true') throw Error('Wait for the upload to finish before saving.');
      const newLabels = [];
      const out = state.items.map(({ labelText, ...a }) => {
        const found = D.findOrCreateLabel(doc, labelText || 'Other', newLabels);
        if (found.created) newLabels.push(found.label);
        return { ...a, label: found.label.id };
      });
      return { attachments: out, newLabels };
    },
  };
}
/** Paste anywhere in a form (outside the rich editor) adds images/PDFs to the document zone. */
function bindFormPaste(form, zone) {
  form.addEventListener('paste', e => {
    if (e.target.closest('.rich-body')) return;
    const files = documentFiles(e.clipboardData);
    if (!files.length) return;
    e.preventDefault(); zone.add(files);
  });
}

// ---- field inputs ------------------------------------------------------------
function fieldInput(field, value, conditionId, typeId) {
  const name = `f:${field.id}`, id = `fld-${field.id}`, req = field.required ? ' required' : '', star = field.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
  const label = `<label for="${id}">${esc(field.label)}${star}</label>`;
  const v = value ?? '';
  switch (field.kind) {
    case 'longtext': return `<div class="wide">${label}<textarea id="${id}" name="${name}" maxlength="20000"${req}>${esc(v)}</textarea></div>`;
    case 'date': return `<div>${label}<input id="${id}" type="date" name="${name}" value="${esc(v)}"${req}></div>`;
    case 'number': return `<div>${label}<input id="${id}" type="number" step="any" name="${name}" value="${esc(v)}"${req}></div>`;
    case 'checkbox': return `<div><label class="check"><input type="checkbox" name="${name}"${v ? ' checked' : ''}>${esc(field.label)}</label></div>`;
    case 'select': {
      const { presets, used } = S.selectChoices(store.doc, typeId, field, v);
      const opt = o => `<option value="${esc(o)}"${o === v ? ' selected' : ''}>${esc(o)}</option>`;
      if (!field.allowCustom) return `<div>${label}<select id="${id}" name="${name}"${req}><option value="">—</option>${presets.map(opt).join('')}</select></div>`;
      // Free text: presets, then values typed before ("Used before"), then "Free text…" which reveals a text box.
      return `<div class="free-select">${label}<select id="${id}" name="${name}" data-free-select${req}><option value="">—</option>${presets.map(opt).join('')}${used.length ? `<optgroup label="Used before">${used.map(opt).join('')}</optgroup>` : ''}<option value="${S.FREE_TEXT}">Free text…</option></select><input type="text" name="${name}:custom" class="free-text" maxlength="500" placeholder="Type your own ${esc(field.label.toLowerCase())}" aria-label="${esc(field.label)} (free text)" hidden></div>`;
    }
    case 'link': {
      const targets = S.linkTargets(store.doc, field, conditionId), here = targets.filter(t => t.conditionId === conditionId), other = targets.filter(t => t.conditionId !== conditionId);
      const opt = t => `<option value="${esc(t.id)}"${t.id === v ? ' selected' : ''}>${esc(t.title)}</option>`;
      const targetType = S.typeById(store.doc, field.target);
      return `<div>${label}<select id="${id}" name="${name}" data-link-target="${esc(field.target)}"${req}><option value="">— none —</option>${here.length ? `<optgroup label="This condition">${here.map(opt).join('')}</optgroup>` : ''}${other.length ? `<optgroup label="Other conditions">${other.map(opt).join('')}</optgroup>` : ''}</select>${!targets.length ? `<small class="fine">No ${esc(targetType?.name?.toLowerCase() || 'entries')} yet.</small>` : ''}</div>`;
    }
    default: return `<div>${label}<input id="${id}" type="text" name="${name}" value="${esc(v)}" maxlength="500"${req}></div>`;
  }
}
function readValues(form, type) {
  const values = {};
  for (const f of type.fields) {
    const el = form.elements[`f:${f.id}`]; if (!el) continue;
    if (f.kind === 'select' && el.value === S.FREE_TEXT) { values[f.id] = (form.elements[`f:${f.id}:custom`]?.value || '').trim(); continue; }
    values[f.id] = f.kind === 'checkbox' ? el.checked : f.kind === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value.trim();
  }
  return values;
}

// ---- entry form -----------------------------------------------------------------
export function openEntryForm(entry, { typeId, conditionId } = {}) {
  const doc = store.doc, type = S.typeById(doc, entry?.typeId || typeId);
  if (!type) return notice('That entry type no longer exists.');
  const condId = entry?.conditionId || conditionId || doc.conditions[0]?.id;
  if (!condId) return notice('Add a condition first.');
  const conditions = doc.conditions.filter(c => c.status !== 'archived' || c.id === condId);
  const html = `<form id="entry-form" novalidate>${dialogHead(entry ? `Edit ${type.singular.toLowerCase()}` : `Add ${type.singular.toLowerCase()}`, type.name, typeBadge(type, 'lg'))}<div class="dialog-body">
    <div class="field-grid"><div class="wide"><label for="entry-title">${esc(type.titleLabel || 'Title')} <span class="req" aria-hidden="true">*</span></label><input id="entry-title" name="title" required maxlength="200" value="${esc(entry?.title)}" autofocus></div>
    <div class="wide"><label for="entry-condition">Condition</label><select id="entry-condition" name="conditionId">${conditions.map(c => `<option value="${esc(c.id)}"${condOptionAttrs(c)}${c.id === condId ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    ${type.fields.map(f => fieldInput(f, entry?.values?.[f.id], condId, type.id)).join('')}</div>
    ${S.retiredValues(type, entry || { values: {} }).length ? `<div class="retired"><h3>Kept from removed fields</h3><p class="fine">These values stay with the entry. Restore the field on the Entry types page to edit them.</p>${S.retiredValues(type, entry).map(r => `<div><b>${esc(r.field.label)}:</b> ${esc(S.displayValue(doc, r.field, r.value))}</div>`).join('')}</div>` : ''}
    <div class="form-section key-hl-field"><label for="entry-highlight"><span class="hl-star" aria-hidden="true">★</span> Key highlight <small class="muted">— one line that stands out on this event in every list</small></label><textarea id="entry-highlight" name="highlight" rows="2" maxlength="2000" placeholder="The single most important fact about this event">${esc(entry?.highlight)}</textarea></div>
    <div class="form-section">${tagPickerHTML('entry-tags')}</div>
    <div class="form-section"><h3>Notes</h3>${richEditor('entry-notes', 'Rich-text notes', entry?.notes?.html ? noteHTML(entry.notes) : '', { placeholder: 'What happened, what was said, what to remember…' })}</div>
    <div class="form-section"><h3>Documents</h3>${docZoneHTML('entry-docs')}</div>
    <p class="form-error" role="alert"></p></div>
    <div class="dialog-foot"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save ${esc(type.singular.toLowerCase())}</button></div></form>`;
  openDialog(html, el => {
    const form = el.querySelector('form'), notesRoot = el.querySelector('.rich-field');
    bindEditor(notesRoot);
    const tags = bindTagPicker(el.querySelector('.tag-picker'), entry?.tagIds || []);
    const zone = bindDocZone(el.querySelector('.doc-zone'), entry?.attachments || [], () => D.defaultLabelFor(type, readValues(form, type)));
    bindFormPaste(form, zone);
    form.addEventListener('change', e => {
      const sel = e.target.closest('[data-free-select]'); if (!sel) return;
      const box = sel.parentElement.querySelector('.free-text'), on = sel.value === S.FREE_TEXT;
      box.hidden = !on; if (on) box.focus();
    });
    form.onsubmit = async e => {
      e.preventDefault();
      const error = form.querySelector('.form-error'), submit = form.querySelector('[type=submit]');
      try {
        const values = readValues(form, type);
        const draft = { ...(entry || { id: S.newId('entry') }), typeId: type.id, conditionId: form.elements.conditionId.value, title: form.elements.title.value.trim(), values: { ...(entry?.values || {}), ...values } };
        const problems = S.validateEntry(doc, type, draft);
        if (problems.length) throw Error(problems.join(' '));
        const { tagIds, newTags } = tags(), { attachments, newLabels } = zone.value();
        submit.disabled = true;
        await save([...newTags.map(t => put('tag', t)), ...newLabels.map(l => put('docLabel', l)), put('entry', { ...draft, highlight: form.elements.highlight.value.trim(), tagIds, attachments, notes: editorValue(notesRoot, { optional: true }) })], entry ? 'Entry updated.' : `${type.singular} added.`);
        closeDialog(el);
        openEntryDetail(draft.id);
      } catch (err) { error.textContent = err.message; submit.disabled = false; }
    };
  });
}

// ---- entry detail -------------------------------------------------------------------
export function attachmentsHTML(list) {
  if (!list?.length) return '';
  return `<ul class="attachments">${list.map(a => `<li><button type="button" data-action="view-file" data-id="${esc(a.id)}" data-name="${esc(a.name)}" data-kind="${D.fileKind(a)}">${previewHTML(a)}<small><b>${esc(D.labelById(store.doc, a.label).label)}</b><br>${esc(a.name)}</small></button></li>`).join('')}</ul>`;
}
/** Date and status-like value for a backlink, so a list of same-titled visits stays readable. */
function backlinkDetail(b) {
  const date = S.primaryDate(b.type, b.entry), status = b.entry.typeId === S.HH.visit ? b.entry.values?.outcome : b.entry.values?.status;
  const bits = [date ? S.formatDate(date, { month: 'short', day: 'numeric', year: 'numeric' }) : '', typeof status === 'string' ? status : ''].filter(Boolean);
  return bits.length ? ` · ${esc(bits.join(' · '))}` : '';
}
export function openEntryDetail(id) {
  const doc = store.doc, entry = S.entryById(doc, id);
  if (!entry) return notice('That entry no longer exists.');
  const type = S.typeById(doc, entry.typeId);
  const rows = type.fields.map(f => {
    const v = entry.values?.[f.id];
    if (v === undefined || v === '' || v === null) return '';
    const shown = f.kind === 'link' && S.entryById(doc, v) ? `<button type="button" class="link" data-action="open-entry" data-id="${esc(v)}">${esc(S.displayValue(doc, f, v))}</button>` : esc(S.displayValue(doc, f, v));
    return `<dt>${esc(f.label)}</dt><dd>${f.kind === 'date' && relLabel(v) ? relLabel(v, { time: f.id === type.primaryDateField ? eventTime(entry, { primary: true }) : '' }) : shown}</dd>`;
  }).join('');
  const retired = S.retiredValues(type, entry), backs = S.backlinks(doc, entry.id);
  const html = `${dialogHead(entry.title, `${type.singular} · ${conditionName(entry.conditionId)}`, typeBadge(type, 'lg'))}<div class="dialog-body">
    ${String(entry.highlight || '').trim() ? `<div class="key-hl" role="note"><span class="hl-star" aria-hidden="true">★</span><div><b>Key highlight</b><p>${esc(entry.highlight)}</p></div></div>` : ''}
    ${entry.typeId === S.HH.auth ? hhPanel(entry) : ''}
    ${rows ? `<dl class="values">${rows}</dl>` : '<p class="muted">No details filled in yet.</p>'}
    ${retired.length ? `<div class="retired"><h3>Kept from removed fields</h3><dl class="values">${retired.map(r => `<dt>${esc(r.field.label)}</dt><dd>${esc(S.displayValue(doc, r.field, r.value))}</dd>`).join('')}</dl></div>` : ''}
    ${tagsFor(entry).length ? `<p class="chips">${tagsFor(entry).map(tagChip).join('')}</p>` : ''}
    ${entry.notes?.html || entry.notes?.text ? `<div class="form-section"><h3>Notes</h3><div class="note-content">${noteHTML(entry.notes)}</div></div>` : ''}
    ${entry.attachments?.length ? `<div class="form-section"><h3>Documents</h3>${attachmentsHTML(entry.attachments)}</div>` : ''}
    ${backs.length ? `<div class="form-section"><h3>Linked from</h3><ul class="event-list">${backs.map(b => `<li><button type="button" class="link" data-action="open-entry" data-id="${esc(b.entry.id)}">${esc(b.type.singular)}: ${esc(b.entry.title)}</button> <small class="muted">(${esc(b.field.label)})${backlinkDetail(b)}</small></li>`).join('')}</ul></div>` : ''}
    </div><div class="dialog-foot"><div class="left"><button type="button" class="danger" data-action="delete-entry" data-id="${esc(entry.id)}">Delete</button></div><button type="button" data-action="goto-condition" data-id="${esc(entry.conditionId)}">Open condition</button><button type="button" class="primary" data-action="edit-entry" data-id="${esc(entry.id)}">Edit</button></div>`;
  openDialog(html);
}
export async function deleteEntry(id) {
  const entry = S.entryById(store.doc, id), backs = S.backlinks(store.doc, id);
  if (!entry || !confirm(`Delete “${entry.title}”?${backs.length ? ` ${plural(backs.length, 'other entry', 'other entries')} link to it; those links will show as removed.` : ''} A backup of your records is kept on the server.`)) return;
  await save([remove('entry', id)], 'Entry deleted.');
  closeDialog();
}

// ---- condition form ---------------------------------------------------------------------
export function openConditionForm(condition) {
  const doc = store.doc, color = condition?.color || S.TYPE_COLORS[doc.conditions.length % S.TYPE_COLORS.length];
  const html = `<form novalidate>${dialogHead(condition ? 'Edit condition' : 'Add a condition', 'Condition / diagnosis')}<div class="dialog-body"><div class="field-grid">
    <div class="wide cond-desc-field"><label for="c-desc">Description <small class="muted">— shown when you hover the name in lists and pickers</small></label><textarea id="c-desc" name="description" rows="2" maxlength="1000" placeholder="e.g. the full diagnosis, stage, or what makes it urgent">${esc(condition?.description)}</textarea></div>
    <div class="wide"><label for="c-name">Condition name <span class="req" aria-hidden="true">*</span></label><input id="c-name" name="name" required maxlength="120" value="${esc(condition?.name)}" placeholder="e.g. Left knee osteoarthritis" autofocus></div>
    <div><label for="c-status">Status</label><select id="c-status" name="status">${['active', 'resolved', 'archived'].map(s => `<option value="${s}"${(condition?.status || 'active') === s ? ' selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></div>
    <div><label for="c-dx">Diagnosed</label><input id="c-dx" type="date" name="diagnosedOn" value="${esc(condition?.diagnosedOn)}"></div>
    <div class="wide"><label for="c-summary">One-line summary</label><input id="c-summary" name="summary" maxlength="400" value="${esc(condition?.summary)}" placeholder="What this condition covers"></div>
    <div class="wide"><span class="field-label">Color</span><div class="swatches">${S.TYPE_COLORS.map(c => `<button type="button" style="--swatch:${c}" data-swatch="${c}" aria-label="Color ${c}" aria-pressed="${c === color}"></button>`).join('')}<input type="color" name="color" value="${esc(color)}" aria-label="Custom color"></div></div></div>
    <div class="form-section"><h3>Notes</h3>${richEditor('condition-notes', 'Condition notes', condition?.notes?.html ? noteHTML(condition.notes) : '', { placeholder: 'History, care plan, questions…' })}</div>
    <div class="form-section"><h3>Documents</h3>${docZoneHTML('condition-docs')}</div>
    <p class="form-error" role="alert"></p></div><div class="dialog-foot"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save condition</button></div></form>`;
  openDialog(html, el => {
    const form = el.querySelector('form'), notesRoot = el.querySelector('.rich-field');
    bindEditor(notesRoot);
    const zone = bindDocZone(el.querySelector('.doc-zone'), condition?.attachments || [], () => 'other');
    bindFormPaste(form, zone);
    el.querySelectorAll('[data-swatch]').forEach(b => b.onclick = () => { form.elements.color.value = b.dataset.swatch; el.querySelectorAll('[data-swatch]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    form.onsubmit = async e => {
      e.preventDefault();
      try {
        let name = form.elements.name.value.trim(), description = form.elements.description.value.trim();
        // "Short name [description]" in the name box splits into the two parts when the description is empty.
        if (!description) { const split = S.splitConditionName(name); if (split.description) ({ name, description } = split); }
        if (!name) throw Error('Give the condition a name.');
        const { attachments, newLabels } = zone.value();
        const value = { ...(condition || { id: S.newId('cond'), sortOrder: doc.conditions.length }), name, description, status: form.elements.status.value, diagnosedOn: form.elements.diagnosedOn.value, summary: form.elements.summary.value.trim(), color: form.elements.color.value, notes: editorValue(notesRoot, { optional: true }), attachments };
        await save([...newLabels.map(l => put('docLabel', l)), put('condition', value)], condition ? 'Condition updated.' : 'Condition added.');
        closeDialog(el);
        if (!condition) location.hash = `#/c/${value.id}`;
      } catch (err) { form.querySelector('.form-error').textContent = err.message; }
    };
  });
}

// ---- viewer -----------------------------------------------------------------------------
export function openViewer(id, name, kind) {
  const viewer = document.querySelector('#viewer');
  const body = kind === 'pdf' ? `<iframe src="${esc(fileURL(id, { name }))}" title="${esc(name)}"></iframe>` : `<img src="${esc(imageURL(id))}" alt="${esc(name)}">`;
  openDialog(`${dialogHead(name, kind === 'pdf' ? 'PDF document' : 'Image')}<div class="viewer-body">${body}</div><div class="dialog-foot"><a class="button" href="${esc(fileURL(id, { name }))}" target="_blank" rel="noopener">Open in new tab</a><a class="button" href="${esc(fileURL(id, { name, download: true }))}">Download</a><button type="button" class="primary" data-close>Done</button></div>`, () => {}, { el: viewer });
}

// ---- quick upload from the Documents page -------------------------------------------------
export function openQuickUpload(conditionId = '') {
  const doc = store.doc, conds = doc.conditions.filter(c => c.status !== 'archived');
  if (!conds.length) return notice('Add a condition first.');
  const cid = conditionId || conds[0].id;
  const entriesFor = c => doc.entries.filter(e => e.conditionId === c).sort((a, b) => a.title.localeCompare(b.title));
  const html = `<form novalidate>${dialogHead('Upload documents', 'Lab results, notes, letters, photos')}<div class="dialog-body"><div class="field-grid">
    <div><label for="qu-cond">Condition</label><select id="qu-cond" name="conditionId">${conds.map(c => `<option value="${esc(c.id)}"${condOptionAttrs(c)}${c.id === cid ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div><label for="qu-entry">Attach to</label><select id="qu-entry" name="entryId"></select></div></div>
    ${docZoneHTML('quick-docs')}<p class="form-error" role="alert"></p></div><div class="dialog-foot"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save documents</button></div></form>`;
  openDialog(html, el => {
    const form = el.querySelector('form'), entrySel = form.elements.entryId;
    const fill = () => { entrySel.innerHTML = `<option value="">The condition itself</option>${entriesFor(form.elements.conditionId.value).map(e => `<option value="${esc(e.id)}">${esc(S.typeById(doc, e.typeId)?.singular || '')}: ${esc(e.title)}</option>`).join('')}`; };
    fill(); form.elements.conditionId.onchange = fill;
    const zone = bindDocZone(el.querySelector('.doc-zone'), [], () => { const e = S.entryById(doc, entrySel.value); return e ? D.defaultLabelFor(S.typeById(doc, e.typeId), e.values) : 'other'; });
    bindFormPaste(form, zone);
    form.onsubmit = async ev => {
      ev.preventDefault();
      try {
        const { attachments, newLabels } = zone.value(); if (!attachments.length) throw Error('Add at least one file.');
        const target = entrySel.value ? S.entryById(doc, entrySel.value) : doc.conditions.find(c => c.id === form.elements.conditionId.value);
        const merged = [...(target.attachments || []), ...attachments.filter(a => !(target.attachments || []).some(x => x.id === a.id))];
        await save([...newLabels.map(l => put('docLabel', l)), put(entrySel.value ? 'entry' : 'condition', { ...target, attachments: merged })], `${plural(attachments.length, 'document')} saved.`);
        closeDialog(el);
      } catch (err) { form.querySelector('.form-error').textContent = err.message; }
    };
  });
}

// ---- Memo (t61u): notes to self for one condition, plain text with its spacing kept ----------
export function openMemo(conditionId) {
  const c = store.doc.conditions.find(x => x.id === conditionId);
  if (!c) return notice('That condition no longer exists.');
  const html = `<form id="memo-form" class="memo-form" novalidate>${dialogHead('Memo', c.name)}<div class="dialog-body">
    <p class="memo-explain">Memo is where you keep notes to yourself, such as documents you’ll incorporate here and to-dos.</p>
    <label for="memo-text" class="skip">Memo for ${esc(c.name)}</label>
    <textarea id="memo-text" name="memo" rows="14" maxlength="20000" placeholder="To add: …&#10;To do: …">${esc(c.memo || '')}</textarea>
    <p class="fine muted">Only you see this. It is not part of the timeline.</p>
    <p class="form-error" role="alert"></p></div>
    <div class="dialog-foot"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save memo</button></div></form>`;
  openDialog(html, el => {
    const form = el.querySelector('form'), box = form.elements.memo;
    box.focus(); box.setSelectionRange(box.value.length, box.value.length);
    form.onsubmit = async e => {
      e.preventDefault();
      const submit = form.querySelector('[type=submit]'); submit.disabled = true;
      try {
        const latest = store.doc.conditions.find(x => x.id === conditionId) || c;
        await save([put('condition', { ...latest, memo: box.value.replace(/\s+$/, '') })], 'Memo saved.');
        el.dataset.dirty = ''; closeDialog(el);
      } catch (err) { form.querySelector('.form-error').textContent = err.message; submit.disabled = false; }
    };
  });
}
