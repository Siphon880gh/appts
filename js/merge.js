// Offline-mode helpers with no browser dependencies (tested in Node): applying queued ops to the
// local copy, and the three-way merge used when queued changes are synced. Rule: never lose data.
// When both sides changed the same field, the server value stays and our value is kept in the notes.
export const COLLECTIONS = { condition: 'conditions', type: 'types', entry: 'entries', tag: 'tags', docLabel: 'docLabels', filter: 'filters' };
const SKIP = new Set(['updatedAt', 'createdAt']);
const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.keys(v).sort().reduce((o, k) => (SKIP.has(k) || v[k] === undefined ? o : (o[k] = canon(v[k]), o)), {});
  return v;
}
export const same = (a, b) => JSON.stringify(canon(a ?? null)) === JSON.stringify(canon(b ?? null));
const find = (list, id) => (list || []).find(r => r && r.id === id) || null;

/** Apply ops to a copy of the document the way api.php would (validation stays on the server). */
export function applyLocal(doc, ops) {
  const next = clone(doc);
  for (const op of ops) {
    const col = COLLECTIONS[op.kind];
    if (!col) throw Error('Unknown record kind.');
    next[col] = next[col] || [];
    if (op.op === 'put') {
      const value = { ...clone(op.value), updatedAt: new Date().toISOString() };
      // Same rule as image_ids_in() on the server.
      if (value.notes && typeof value.notes.html === 'string') value.notes = { ...value.notes, imageIds: [...new Set([...value.notes.html.matchAll(/data-image-id="([a-f0-9]{64}\.(?:png|jpg|gif|webp))"/g)].map(m => m[1]))] };
      const i = next[col].findIndex(r => r.id === value.id);
      if (i < 0) next[col].push({ createdAt: value.updatedAt, ...value });
      else {
        const old = next[col][i];
        // Like the server: an entry keeps values of fields the edit did not send.
        next[col][i] = { ...value, createdAt: old.createdAt, ...(op.kind === 'entry' ? { values: { ...(old.values || {}), ...(value.values || {}) } } : {}) };
      }
    } else if (op.op === 'delete') {
      if (op.kind === 'type') throw Error('Entry types cannot be deleted. Archive the type instead; its entries stay.');
      if (op.kind === 'docLabel') throw Error('Document labels stay so older uploads keep their label. Rename it instead.');
      if (op.kind === 'condition' && next.entries.some(e => e.conditionId === op.id)) throw Error('Move or delete this condition’s entries first, or archive the condition.');
      const i = next[col].findIndex(r => r.id === op.id);
      if (i < 0) throw Error('That record no longer exists.');
      next[col].splice(i, 1);
      if (op.kind === 'tag') next.entries.forEach(e => { e.tagIds = (e.tagIds || []).filter(t => t !== op.id); });
    } else throw Error('Unknown change.');
  }
  next.revision = (next.revision || 0) + 1;
  return next;
}

/** Overlay queued records ({kind,id,ours}) onto a document from the server or the saved copy. */
export function overlay(doc, pending) {
  const next = clone(doc);
  for (const p of pending) {
    const col = COLLECTIONS[p.kind]; next[col] = next[col] || [];
    const i = next[col].findIndex(r => r.id === p.id);
    if (p.ours === null) { if (i >= 0) next[col].splice(i, 1); }
    else if (i < 0) next[col].push(clone(p.ours)); else next[col][i] = clone(p.ours);
  }
  return next;
}

const unionBy = (key, ...lists) => { const seen = new Map(); for (const l of lists) for (const x of l || []) { const k = key(x); if (!seen.has(k)) seen.set(k, x); } return [...seen.values()]; };
/** Three-way merge of a list: server order, minus what we removed, plus what we added. */
function setMerge(key, b, o, t) {
  const ids = l => new Set((l || []).map(key)), B = ids(b), O = ids(o), T = ids(t);
  return [...(t || []).filter(x => !(B.has(key(x)) && !O.has(key(x)))), ...(o || []).filter(x => !T.has(key(x)) && !B.has(key(x)))].map(clone);
}
const shown = v => Array.isArray(v) ? v.join(', ') : (v && typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
const escapeHTML = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Three-way merge of one record. Fields only one side changed take that side; lists of ids are
 * unioned; type fields merge by id; notes edited on both sides keep both texts; any other clash keeps
 * the server value and reports ours in `conflicts` ({field, ours}).
 */
export function mergeRecord(kind, base, ours, theirs, path = '') {
  base = base || {};
  const out = {}, conflicts = [];
  for (const k of new Set([...Object.keys(theirs), ...Object.keys(ours), ...Object.keys(base)])) {
    const b = base[k], o = ours[k], t = theirs[k];
    if (SKIP.has(k)) { if (t !== undefined) out[k] = t; continue; }
    if (same(o, t) || same(o, b)) { if (t !== undefined) out[k] = clone(t); continue; }
    if (same(t, b)) { if (o !== undefined) out[k] = clone(o); continue; }
    // Both sides changed this key.
    if (k === 'values' && o && t && typeof o === 'object' && typeof t === 'object') { const m = mergeRecord(kind, b || {}, o, t, 'values.'); out[k] = m.value; conflicts.push(...m.conflicts); }
    else if (k === 'tagIds' || k === 'options' || k === 'imageIds' || k === 'include' || k === 'exclude') out[k] = setMerge(x => (x && typeof x === 'object' ? JSON.stringify(x) : x), b, o, t);
    else if (k === 'attachments') out[k] = setMerge(x => x && x.id, b, o, t);
    else if (k === 'fields' || k === 'retiredFields') out[k] = unionBy(x => x.id, t, o).map(f => { const ff = (t || []).find(x => x.id === f.id), of = (o || []).find(x => x.id === f.id), bf = (b || []).find(x => x.id === f.id); if (!ff || !of) return clone(f); const m = mergeRecord('field', bf, of, ff, `${k}.${f.id}.`); conflicts.push(...m.conflicts); return m.value; });
    else if (k === 'notes' && o && t) out[k] = { html: `${t.html || ''}<p><strong>Also written offline on this device:</strong></p>${o.html || ''}`, imageIds: unionBy(x => x, t.imageIds, o.imageIds) };
    else { if (t !== undefined) out[k] = clone(t); conflicts.push({ field: path + k, ours: o }); }
  }
  if (!path && conflicts.length && (kind === 'entry' || kind === 'condition')) {
    const lines = conflicts.map(c => `<li>${escapeHTML(c.field.replace(/^values\./, ''))}: ${escapeHTML(shown(c.ours)) || '(empty)'}</li>`).join('');
    const notes = out.notes || { html: '' };
    out.notes = { ...notes, html: `${notes.html || ''}<p><strong>Offline edit not applied (this was also changed on the server, so the server value was kept):</strong></p><ul>${lines}</ul>` };
  }
  return { value: out, conflicts };
}

/**
 * Turn queued records into ops against the current server document. Returns
 * {ops: [{op, key}], report: [{key, kind, id, note}]} with ops in an order the server accepts.
 */
export function planSync(pending, server) {
  const puts = { tag: [], docLabel: [], type: [], condition: [], entry: [], filter: [] }, deletes = { entry: [], condition: [], tag: [] }, report = [];
  for (const p of pending) {
    const theirs = find(server[COLLECTIONS[p.kind]], p.id), key = p.key;
    if (p.ours === null) {
      if (!p.base || !theirs) continue; // created and deleted offline, or already gone
      if (same(theirs, p.base)) (deletes[p.kind] || []).push({ op: { op: 'delete', kind: p.kind, id: p.id }, key });
      else report.push({ key, kind: p.kind, id: p.id, note: 'changed on the server while you were offline, so it was kept instead of deleted' });
      continue;
    }
    let value = p.ours;
    if (theirs && !same(theirs, p.base) && !same(theirs, p.ours)) {
      const m = mergeRecord(p.kind, p.base, p.ours, theirs);
      value = m.value;
      if (m.conflicts.length) report.push({ key, kind: p.kind, id: p.id, note: `both sides changed ${m.conflicts.map(c => c.field.replace(/^values\./, '')).join(', ')}; the server value was kept${p.kind === 'entry' || p.kind === 'condition' ? ' and your offline value was added to the notes' : ''}` });
    } else if (!theirs && p.base) report.push({ key, kind: p.kind, id: p.id, note: 'was deleted on the server, so your offline edit restored it' });
    if (theirs && same(theirs, value)) continue;
    puts[p.kind].push({ op: { op: 'put', kind: p.kind, value: { ...value, notes: value.notes ? { html: value.notes.html || '' } : value.notes } }, key });
    if (value.notes === undefined) delete puts[p.kind][puts[p.kind].length - 1].op.value.notes;
  }
  const ops = [...puts.tag, ...puts.docLabel, ...puts.type, ...puts.condition, ...puts.entry, ...puts.filter, ...deletes.entry, ...deletes.condition, ...deletes.tag];
  return { ops, report };
}

/** Replace a temporary file id (offline) with the id the server assigned, everywhere in a record. */
export function remapIds(record, map) {
  if (!record || !Object.keys(map).length) return record;
  let s = JSON.stringify(record);
  for (const [from, to] of Object.entries(map)) s = s.split(from).join(to);
  return JSON.parse(s);
}
