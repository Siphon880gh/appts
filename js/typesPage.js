// Entry types page: add types, rename, icon + color, add/remove/reorder fields, archive.
// Removing a field retires it (values stay); archiving hides the type from "Add" menus only.
import * as S from './schema.js';
import { ICONS, ICON_KEYS, iconSVG, typeBadge, hasIcon } from './icons.js';
import { store, save, put } from './store.js';
import { esc, openDialog, closeDialog, dialogHead, plural } from './ui.js';

export function renderTypes() {
  const doc = store.doc, types = S.sortTypes(doc.types), active = types.filter(t => !t.archived), archived = types.filter(t => t.archived);
  const count = id => doc.entries.filter(e => e.typeId === id).length;
  const row = t => `<li>${typeBadge(t, 'lg')}<div><h3>${esc(t.name)} ${t.builtin ? '<span class="badge">Built-in</span>' : '<span class="badge">Custom</span>'} ${t.archived ? '<span class="badge archived">Archived</span>' : ''}</h3><div class="meta">${plural(t.fields.length, 'field')} · ${plural(count(t.id), 'entry', 'entries')}${t.retiredFields?.length ? ` · ${plural(t.retiredFields.length, 'removed field')} kept` : ''}${hasIcon(t.icon) ? '' : ' · placeholder icon'}</div></div><div class="actions"><button type="button" data-action="edit-type" data-id="${esc(t.id)}">Edit</button></div></li>`;
  return `<div class="page-heading"><div><p class="eyebrow">Customize your record</p><h1>Entry types</h1><p class="muted">Every form, timeline item, and filter is built from these definitions. The ten built-ins are just a starting point: rename them, change icons and colors, add or reorder fields, or create your own. Removing a field or archiving a type never deletes what you already recorded.</p></div><div class="actions"><button class="primary" type="button" data-action="new-type">+ New entry type</button></div></div>
    <ul class="type-table" aria-label="Active entry types">${active.map(row).join('')}</ul>
    ${archived.length ? `<h2>Archived types</h2><p class="muted">Hidden from “Add” menus. Their entries stay on timelines and in search.</p><ul class="type-table" aria-label="Archived entry types">${archived.map(row).join('')}</ul>` : ''}`;
}

export function openTypeEditor(typeId) {
  const doc = store.doc, original = typeId ? S.typeById(doc, typeId) : S.newType(doc, '');
  let draft = structuredClone(original);
  const isNew = !typeId;
  const kindOptions = S.FIELD_KINDS.map(k => `<option value="${k.kind}">${k.label}</option>`).join('');
  const linkTargets = () => S.sortTypes(doc.types.filter(t => t.id !== draft.id || !isNew)).map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('') + '<option value="any">Any entry</option>';

  function fieldsHTML() {
    return draft.fields.map((f, i) => `<li data-field="${esc(f.id)}"><input aria-label="Field label" value="${esc(f.label)}" data-rename="${esc(f.id)}" maxlength="60"><span class="kind">${esc(S.KIND_LABEL[f.kind])}${f.kind === 'link' ? ` → ${esc(f.target === 'any' ? 'any' : S.typeById(doc, f.target)?.singular || f.target)}` : ''}${f.required ? ' · required' : ''}${f.kind === 'select' ? ` · ${f.options.length} options` : ''}</span>${f.kind === 'select' ? `<label class="check free-toggle" title="Let entries pick a preset or type their own value"><input type="checkbox" data-custom="${esc(f.id)}"${f.allowCustom ? ' checked' : ''}>Allow free text</label>` : ''}<span class="row-actions"><button type="button" data-move="${esc(f.id)}" data-delta="-1" aria-label="Move ${esc(f.label)} up" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-move="${esc(f.id)}" data-delta="1" aria-label="Move ${esc(f.label)} down" ${i === draft.fields.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="danger" data-retire="${esc(f.id)}" aria-label="Remove ${esc(f.label)}">Remove</button></span></li>`).join('') || '<li><span class="muted">No fields yet. Every entry still has a title, notes, tags, and documents.</span></li>';
  }
  function retiredHTML() {
    return draft.retiredFields?.length ? `<div class="retired"><h3>Removed fields (values kept)</h3>${draft.retiredFields.map(f => `<div class="row" style="display:flex;gap:10px;align-items:center;margin:4px 0"><span>${esc(f.label)} <small class="muted">${esc(S.KIND_LABEL[f.kind])}</small></span><button type="button" data-restore="${esc(f.id)}">Restore</button></div>`).join('')}</div>` : '';
  }
  function primaryHTML() {
    const dates = draft.fields.filter(f => f.kind === 'date');
    return `<option value="">None (not on the timeline by default)</option>${dates.map(f => `<option value="${esc(f.id)}"${f.id === draft.primaryDateField ? ' selected' : ''}>${esc(f.label)}</option>`).join('')}`;
  }
  const html = `<form novalidate>${dialogHead(isNew ? 'New entry type' : `Edit ${original.name}`, original.builtin ? 'Built-in type (seed)' : 'Custom type', `<span id="type-preview">${typeBadge(draft, 'lg')}</span>`)}<div class="dialog-body">
    <div class="field-grid"><div><label for="t-name">Type name (plural) <span class="req" aria-hidden="true">*</span></label><input id="t-name" name="name" value="${esc(draft.name)}" maxlength="60" required placeholder="e.g. Lab results" autofocus></div>
    <div><label for="t-singular">One entry is called</label><input id="t-singular" name="singular" value="${esc(draft.singular)}" maxlength="40" placeholder="e.g. Lab result"></div>
    <div><label for="t-title">Title field label</label><input id="t-title" name="titleLabel" value="${esc(draft.titleLabel)}" maxlength="40" placeholder="Title"></div>
    <div><label for="t-primary">Timeline date</label><select id="t-primary" name="primaryDateField">${primaryHTML()}</select></div></div>
    <span class="field-label" id="icon-label">Icon</span><div class="icon-grid" role="group" aria-labelledby="icon-label"><button type="button" data-icon="" aria-pressed="${!hasIcon(draft.icon)}" title="No icon (placeholder)">${iconSVG('')}</button>${ICON_KEYS.map(k => `<button type="button" data-icon="${k}" aria-pressed="${draft.icon === k}" title="${esc(ICONS[k][0])}" aria-label="${esc(ICONS[k][0])}">${iconSVG(k)}</button>`).join('')}</div>
    <span class="field-label">Color</span><div class="swatches">${S.TYPE_COLORS.map(c => `<button type="button" style="--swatch:${c}" data-swatch="${c}" aria-label="Color ${c}" aria-pressed="${c === draft.color}"></button>`).join('')}<input type="color" name="color" value="${esc(draft.color)}" aria-label="Custom color"></div>
    <div class="form-section"><h3>Fields</h3><ul class="field-rows">${fieldsHTML()}</ul><div id="retired-box">${retiredHTML()}</div>
    <div class="add-field" id="add-field"><div><label for="nf-label">New field label</label><input id="nf-label" maxlength="60" placeholder="e.g. Result value"></div><div><label for="nf-kind">Kind</label><select id="nf-kind">${kindOptions}</select></div>
      <div class="wide" data-for="select" hidden><label for="nf-options">Options (one per line)</label><textarea id="nf-options" placeholder="Low&#10;Normal&#10;High"></textarea><label class="check"><input type="checkbox" id="nf-custom">Allow free text (pick an option or type your own)</label></div>
      <div class="wide" data-for="link" hidden><label for="nf-target">Links to</label><select id="nf-target">${linkTargets()}</select></div>
      <label class="check wide"><input type="checkbox" id="nf-required">Required</label><div class="wide"><button type="button" id="nf-add">+ Add field</button> <span class="form-error" id="nf-error" role="alert"></span></div></div></div>
    <p class="form-error" role="alert" id="type-error"></p></div>
    <div class="dialog-foot"><div class="left">${isNew ? '' : `<button type="button" data-archive>${original.archived ? 'Restore type' : 'Archive type'}</button>`}</div><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save type</button></div></form>`;
  openDialog(html, el => {
    const form = el.querySelector('form');
    const redraw = () => {
      el.querySelector('.field-rows').innerHTML = fieldsHTML();
      el.querySelector('#retired-box').innerHTML = retiredHTML();
      form.elements.primaryDateField.innerHTML = primaryHTML();
      el.querySelector('#type-preview').innerHTML = typeBadge(draft, 'lg');
    };
    el.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.icon !== undefined && b.closest('.icon-grid')) { draft.icon = b.dataset.icon; el.querySelectorAll('.icon-grid button').forEach(x => x.setAttribute('aria-pressed', x === b)); redraw(); }
      if (b.dataset.swatch) { draft.color = b.dataset.swatch; form.elements.color.value = b.dataset.swatch; el.querySelectorAll('[data-swatch]').forEach(x => x.setAttribute('aria-pressed', x === b)); redraw(); }
      if (b.dataset.move) { draft = S.moveField(draft, b.dataset.move, Number(b.dataset.delta)); redraw(); }
      if (b.dataset.retire) { draft = S.removeField(draft, b.dataset.retire); redraw(); }
      if (b.dataset.restore) { draft = S.restoreField(draft, b.dataset.restore); redraw(); }
    });
    form.elements.color.oninput = () => { draft.color = form.elements.color.value; el.querySelectorAll('[data-swatch]').forEach(x => x.setAttribute('aria-pressed', x.dataset.swatch === draft.color)); redraw(); };
    el.querySelector('.field-rows').addEventListener('input', e => { const id = e.target.dataset.rename; if (id) draft = S.updateField(draft, id, { label: e.target.value }); });
    el.querySelector('.field-rows').addEventListener('change', e => { const id = e.target.dataset.custom; if (id) draft = S.updateField(draft, id, { allowCustom: e.target.checked }); });
    form.elements.primaryDateField.onchange = () => { draft.primaryDateField = form.elements.primaryDateField.value; };
    const kind = el.querySelector('#nf-kind');
    kind.onchange = () => el.querySelectorAll('#add-field [data-for]').forEach(x => { x.hidden = x.dataset.for !== kind.value; });
    el.querySelector('#nf-add').onclick = () => {
      const err = el.querySelector('#nf-error');
      try {
        draft = S.addField(draft, { label: el.querySelector('#nf-label').value, kind: kind.value, options: el.querySelector('#nf-options').value.split('\n'), target: el.querySelector('#nf-target').value, required: el.querySelector('#nf-required').checked, allowCustom: el.querySelector('#nf-custom').checked });
        if (kind.value === 'date' && !draft.primaryDateField) draft.primaryDateField = draft.fields.at(-1).id;
        el.querySelector('#nf-label').value = ''; el.querySelector('#nf-options').value = ''; el.querySelector('#nf-required').checked = false; el.querySelector('#nf-custom').checked = false; err.textContent = '';
        redraw(); el.querySelector('#nf-label').focus();
      } catch (e2) { err.textContent = e2.message; }
    };
    el.querySelector('#nf-label').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); el.querySelector('#nf-add').click(); } };
    el.querySelector('[data-archive]')?.addEventListener('click', async () => {
      const n = doc.entries.filter(e => e.typeId === original.id).length;
      if (!original.archived && !confirm(`Archive “${original.name}”? It disappears from “Add” menus. Its ${plural(n, 'entry', 'entries')} stay visible on timelines and in search.`)) return;
      await save([put('type', S.archiveType(original, !original.archived))], original.archived ? 'Type restored.' : 'Type archived. Entries kept.');
      closeDialog(el);
    });
    form.onsubmit = async e => {
      e.preventDefault();
      try {
        const name = form.elements.name.value.trim(); if (!name) throw Error('Give the type a name.');
        const value = { ...draft, name, singular: form.elements.singular.value.trim() || name, titleLabel: form.elements.titleLabel.value.trim() || 'Title', primaryDateField: form.elements.primaryDateField.value };
        if (value.fields.some(f => !f.label.trim())) throw Error('Every field needs a label.');
        await save([put('type', value)], isNew ? `“${name}” created.` : 'Type saved.');
        closeDialog(el);
      } catch (err) { el.querySelector('#type-error').textContent = err.message; }
    };
  });
}
