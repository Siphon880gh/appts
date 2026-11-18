// Pure domain helpers (no DOM). Forms, timeline, filters, and search all read entry-type
// definitions from the account document, so custom types work everywhere built-ins do.

export const FIELD_KINDS = [
  { kind: 'text', label: 'Text' },
  { kind: 'longtext', label: 'Long text' },
  { kind: 'date', label: 'Date' },
  { kind: 'number', label: 'Number' },
  { kind: 'select', label: 'Select' },
  { kind: 'checkbox', label: 'Checkbox' },
  { kind: 'link', label: 'Link to entry' },
];
export const KIND_LABEL = Object.fromEntries(FIELD_KINDS.map(k => [k.kind, k.label]));
export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const TYPE_COLORS = ['#2f5d8a', '#a4541c', '#5b4a99', '#8f2f45', '#3f6b3a', '#9a6a00', '#245e6b', '#b42318', '#7a2e8a', '#6b5b2a', '#172943', '#c2410c', '#0f766e', '#be185d', '#4d7c0f', '#64748b'];

export function newId(prefix = 'id') {
  const rand = globalThis.crypto?.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16) : Math.random().toString(16).slice(2, 18);
  return `${prefix}-${rand}`;
}
export function today(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function addDays(date, days) {
  const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days); return today(d);
}
export function daysBetween(from, to) {
  return Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000);
}
export function relativeDay(date, from = today()) {
  const n = daysBetween(from, date);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

// ---- types ---------------------------------------------------------------
export const sortTypes = types => [...types].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
export const typeById = (doc, id) => doc.types.find(t => t.id === id);
export const activeTypes = doc => sortTypes(doc.types.filter(t => !t.archived));
export function allFields(type) { return [...(type.fields || []), ...(type.retiredFields || [])]; }

export function addField(type, field) {
  const clean = { id: field.id || newId('f'), label: String(field.label || '').trim(), kind: field.kind, options: field.kind === 'select' ? [...new Set((field.options || []).map(o => String(o).trim()).filter(Boolean))] : [], required: !!field.required, target: field.kind === 'link' ? (field.target || 'doctor') : '' };
  if (clean.kind === 'select') clean.allowCustom = !!field.allowCustom;
  if (!clean.label) throw Error('Give the field a label.');
  if (!KIND_LABEL[clean.kind]) throw Error('Choose a field kind.');
  if (clean.kind === 'select' && !clean.options.length) throw Error('Add at least one option for a select field.');
  if (allFields(type).some(f => f.label.toLowerCase() === clean.label.toLowerCase() && !type.retiredFields?.some(r => r.id === f.id))) throw Error(`This type already has a “${clean.label}” field.`);
  return { ...type, fields: [...type.fields, clean] };
}
/** Removing a field only retires its definition; entry values are untouched. */
export function removeField(type, fieldId) {
  const field = type.fields.find(f => f.id === fieldId);
  if (!field) return type;
  const fields = type.fields.filter(f => f.id !== fieldId);
  const primaryDateField = type.primaryDateField === fieldId ? (fields.find(f => f.kind === 'date')?.id || '') : type.primaryDateField;
  return { ...type, fields, primaryDateField, retiredFields: [...(type.retiredFields || []).filter(f => f.id !== fieldId), field] };
}
export function restoreField(type, fieldId) {
  const field = (type.retiredFields || []).find(f => f.id === fieldId);
  if (!field) return type;
  return { ...type, fields: [...type.fields, field], retiredFields: type.retiredFields.filter(f => f.id !== fieldId) };
}
export function moveField(type, fieldId, delta) {
  const fields = [...type.fields], i = fields.findIndex(f => f.id === fieldId), j = i + delta;
  if (i < 0 || j < 0 || j >= fields.length) return type;
  [fields[i], fields[j]] = [fields[j], fields[i]];
  return { ...type, fields };
}
export function updateField(type, fieldId, changes) {
  return { ...type, fields: type.fields.map(f => f.id === fieldId ? { ...f, ...changes, id: f.id, kind: f.kind } : f) };
}
export const archiveType = (type, archived = true) => ({ ...type, archived });
export function newType(doc, name = 'New type') {
  return { id: newId('type'), name, singular: name, icon: '', color: TYPE_COLORS[doc.types.length % TYPE_COLORS.length], titleLabel: 'Title', primaryDateField: '', fields: [], retiredFields: [], builtin: false, archived: false, sortOrder: Math.max(0, ...doc.types.map(t => t.sortOrder ?? 0)) + 1 };
}

// ---- entries -------------------------------------------------------------
const empty = v => v === undefined || v === null || v === '';
/** Sentinel option value for "Free text…" in a select that allows free text. */
export const FREE_TEXT = '__free_text__';
/**
 * Choices for a select field: its presets, plus (when the field allows free text) values typed
 * before for this type's field, newest first, so a custom status can be reused.
 */
export function selectChoices(doc, typeId, field, current = '') {
  const presets = [...(field.options || [])];
  if (!field.allowCustom) return { presets: current && !presets.includes(current) ? [...presets, current] : presets, used: [] };
  const seen = new Set(presets), used = [];
  const entries = doc.entries.filter(e => e.typeId === typeId).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  for (const v of [current, ...entries.map(e => e.values?.[field.id])]) {
    if (typeof v !== 'string' || !v.trim() || seen.has(v)) continue;
    seen.add(v); used.push(v);
  }
  return { presets, used };
}
export function validateEntry(doc, type, entry) {
  const errors = [];
  if (!String(entry.title || '').trim()) errors.push(`${type.titleLabel || 'Title'} is required.`);
  if (!doc.conditions.some(c => c.id === entry.conditionId)) errors.push('Choose a condition.');
  for (const f of type.fields) {
    const v = entry.values?.[f.id];
    if (f.required && (empty(v) || v === false)) { errors.push(`${f.label} is required.`); continue; }
    if (empty(v)) continue;
    if (f.kind === 'date' && !DATE_RE.test(v)) errors.push(`${f.label} must be a valid date.`);
    if (f.kind === 'number' && !Number.isFinite(Number(v))) errors.push(`${f.label} must be a number.`);
    if (f.kind === 'link' && !doc.entries.some(e => e.id === v)) errors.push(`${f.label} points at an entry that no longer exists.`);
  }
  return errors;
}
export const entryById = (doc, id) => doc.entries.find(e => e.id === id);
export function primaryDate(type, entry) { return type?.primaryDateField ? entry.values?.[type.primaryDateField] || '' : ''; }

export function displayValue(doc, field, value) {
  if (empty(value)) return '';
  if (field.kind === 'checkbox') return value ? 'Yes' : 'No';
  if (field.kind === 'link') return entryById(doc, value)?.title || '(removed entry)';
  if (field.kind === 'date') return formatDate(value);
  if (field.kind === 'number') return Number(value).toLocaleString();
  return String(value);
}
export function formatDate(date, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!DATE_RE.test(date || '')) return date || '';
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, opts);
}
/** Values that belong to retired (or unknown) fields; still shown so nothing is lost. */
export function retiredValues(type, entry) {
  const live = new Set(type.fields.map(f => f.id));
  const known = Object.fromEntries((type.retiredFields || []).map(f => [f.id, f]));
  return Object.entries(entry.values || {}).filter(([k, v]) => !live.has(k) && !empty(v)).map(([k, v]) => ({ field: known[k] || { id: k, label: k, kind: 'text' }, value: v }));
}
export function linkTargets(doc, field, conditionId) {
  const list = doc.entries.filter(e => field.target === 'any' || e.typeId === field.target);
  return list.sort((a, b) => (b.conditionId === conditionId) - (a.conditionId === conditionId) || a.title.localeCompare(b.title));
}
export function backlinks(doc, entryId) {
  const out = [];
  for (const e of doc.entries) {
    const type = typeById(doc, e.typeId); if (!type) continue;
    for (const f of allFields(type)) if (f.kind === 'link' && e.values?.[f.id] === entryId) out.push({ entry: e, field: f, type });
  }
  return out;
}

// ---- timeline, upcoming ----------------------------------------------------
/** Every filled date field of an entry is an event; the type's primary date field is marked. */
export function entryEvents(doc, entry) {
  const type = typeById(doc, entry.typeId); if (!type) return [];
  return type.fields.filter(f => f.kind === 'date' && DATE_RE.test(entry.values?.[f.id] || '')).map(f => ({
    key: `${entry.id}:${f.id}`, entryId: entry.id, typeId: type.id, conditionId: entry.conditionId, date: entry.values[f.id], fieldId: f.id,
    label: f.label, primary: f.id === type.primaryDateField, title: entry.title, tagIds: entry.tagIds || [],
  }));
}
export function allEvents(doc, { conditionId = '' } = {}) {
  const live = new Set(doc.conditions.filter(c => c.status !== 'archived').map(c => c.id));
  return doc.entries.filter(e => conditionId ? e.conditionId === conditionId : live.has(e.conditionId)).flatMap(e => entryEvents(doc, e))
    .sort((a, b) => a.date.localeCompare(b.date) || (b.primary - a.primary) || a.title.localeCompare(b.title));
}
export function upcoming(doc, { from = today(), conditionId = '', limit = Infinity, onePerEntry = false } = {}) {
  const seen = new Set();
  return allEvents(doc, { conditionId }).filter(e => e.date >= from)
    .filter(e => !onePerEntry || (!seen.has(e.entryId) && seen.add(e.entryId)))
    .slice(0, limit);
}
/** Types that actually appear in these events, in definition order (archived included if present). */
export function timelineTypes(doc, events) {
  const present = new Set(events.map(e => e.typeId));
  return sortTypes(doc.types.filter(t => present.has(t.id))).map(t => ({ type: t, count: events.filter(e => e.typeId === t.id).length }));
}
export function timelineTags(doc, events) {
  const counts = new Map();
  for (const e of events) for (const id of new Set(e.tagIds)) counts.set(id, (counts.get(id) || 0) + 1);
  return doc.tags.filter(t => counts.has(t.id)).sort((a, b) => a.label.localeCompare(b.label)).map(tag => ({ tag, count: counts.get(tag.id) }));
}
/** Types: any of the selected (OR). Tags: all of the selected (AND). Query: every word must match. */
export function filterEvents(doc, events, { typeIds = [], tagIds = [], query = '' } = {}) {
  const types = new Set(typeIds);
  return events.filter(ev => (!types.size || types.has(ev.typeId)) && tagIds.every(t => ev.tagIds.includes(t)) && (!query.trim() || matchesSearch(doc, entryById(doc, ev.entryId), query)));
}

// ---- search, filter --------------------------------------------------------
const fold = s => String(s ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function entryText(doc, entry) {
  const type = typeById(doc, entry.typeId);
  const parts = [entry.title, type?.name, type?.singular, doc.conditions.find(c => c.id === entry.conditionId)?.name, entry.notes?.text];
  for (const f of type ? allFields(type) : []) parts.push(displayValue(doc, f, entry.values?.[f.id]), entry.values?.[f.id]);
  for (const id of entry.tagIds || []) parts.push(doc.tags.find(t => t.id === id)?.label);
  return fold(parts.filter(p => p !== undefined && p !== null && p !== '').join(' \u2022 '));
}
export function matchesSearch(doc, entry, query) {
  if (!entry) return false;
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = entryText(doc, entry);
  return words.every(w => text.includes(w));
}
export function filterEntries(doc, { conditionId = '', typeIds = [], tagIds = [], query = '' } = {}) {
  const types = new Set(typeIds);
  return doc.entries.filter(e => (!conditionId || e.conditionId === conditionId) && (!types.size || types.has(e.typeId)) && tagIds.every(t => (e.tagIds || []).includes(t)) && matchesSearch(doc, e, query));
}
export function conditionStats(doc, conditionId) {
  const entries = doc.entries.filter(e => e.conditionId === conditionId);
  const counts = sortTypes(doc.types).map(t => ({ type: t, count: entries.filter(e => e.typeId === t.id).length })).filter(x => x.count);
  return { total: entries.length, counts, next: upcoming(doc, { conditionId, limit: 1 })[0] || null };
}

// ---- tags ------------------------------------------------------------------
export function findOrCreateTag(doc, label, pending = []) {
  const clean = String(label).trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!clean) return null;
  const existing = [...doc.tags, ...pending].find(t => t.label.toLowerCase() === clean.toLowerCase());
  if (existing) return { tag: existing, created: false };
  return { tag: { id: newId('tag'), label: clean, color: TYPE_COLORS[(doc.tags.length + pending.length) % TYPE_COLORS.length] }, created: true };
}

// ---- color contrast ----------------------------------------------------------
function luminance(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrastRatio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
/** Ink for text or icons drawn on a type/tag color: whichever of black or white contrasts more. */
export function readableText(color) {
  const hex = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#5c6674';
  return contrastRatio(hex, '#ffffff') >= contrastRatio(hex, '#000000') ? '#ffffff' : '#000000';
}

// ---- home health countdown (t14u) ------------------------------------------------------------
// Only visits whose Outcome is exactly "Completed" (any case) use up an authorization. Missed,
// scheduled, rescheduled, or typed outcomes are listed but never counted.
export const HH = { auth: 'hh_auth', visit: 'hh_visit', event: 'hh_event', waiting: 'Waiting for further approval' };
const AWAITING = ['pending approval', 'waiting for further approval'];
const norm = v => String(v ?? '').trim().toLowerCase();
export const isCompletedVisit = v => norm(v.values?.outcome) === 'completed';

export function authUsage(doc, auth, from = today()) {
  const authorized = Math.max(0, Math.floor(Number(auth.values?.visits_authorized) || 0));
  const visits = doc.entries.filter(e => e.typeId === HH.visit && e.values?.authorization === auth.id);
  const used = visits.filter(isCompletedVisit).length;
  const notCounted = {};
  for (const v of visits) {
    const o = String(v.values?.outcome ?? '').trim();
    if (!o || isCompletedVisit(v) || ['scheduled', 'rescheduled'].includes(norm(o))) continue;
    notCounted[o] = (notCounted[o] || 0) + 1;
  }
  const next = doc.entries.find(e => e.typeId === HH.auth && e.values?.previous === auth.id) || null;
  const waitingEvent = doc.entries.some(e => e.typeId === HH.event && e.values?.authorization === auth.id && norm(e.values?.event_kind) === norm(HH.waiting));
  const left = Math.max(0, authorized - used), over = Math.max(0, used - authorized);
  const ended = !!auth.values?.end && auth.values.end < from;
  let state;
  if (next) state = 'superseded';
  else if (AWAITING.includes(norm(auth.values?.status)) || waitingEvent) state = 'awaiting';
  else if (authorized && left === 0) state = 'used-up';
  else if (ended) state = 'ended';
  else if (left <= 2) state = 'low';
  else state = 'ok';
  return { authorized, used, left, over, visits, notCounted, next, state, attention: ['awaiting', 'used-up', 'low'].includes(state) };
}

export function authCountdown(u) { return `${u.left} of ${u.authorized} authorized visit${u.authorized === 1 ? '' : 's'} left`; }

export function authMessage(u) {
  switch (u.state) {
    case 'low': return `Only ${u.left} visit${u.left === 1 ? '' : 's'} left. Ask the agency to request more before they run out.`;
    case 'used-up': return `All authorized visits are used${u.over ? ` (${u.over} over)` : ''}. Visits usually stop until insurance approves more.`;
    case 'awaiting': return u.left ? `Waiting for insurance to approve more visits. ${u.left} still usable.` : 'Waiting for insurance to approve more visits.';
    case 'ended': return 'This authorization has ended.';
    case 'superseded': return 'Continued by a newer authorization.';
    default: return '';
  }
}

/** Current (not superseded) home health authorizations, most urgent first. */
export function homeHealthAuths(doc, { conditionId = '', from = today(), includeEnded = false } = {}) {
  const rank = { 'used-up': 0, awaiting: 1, low: 2, ok: 3, ended: 4 };
  return doc.entries.filter(e => e.typeId === HH.auth && (!conditionId || e.conditionId === conditionId))
    .map(entry => ({ entry, usage: authUsage(doc, entry, from) }))
    .filter(a => a.usage.state !== 'superseded' && (includeEnded || a.usage.state !== 'ended'))
    .sort((a, b) => rank[a.usage.state] - rank[b.usage.state] || (b.entry.values?.start || '').localeCompare(a.entry.values?.start || ''));
}

// ---- Disruptions filter (t18u) ----------------------------------------------
/** Built-in rule: other care disruptions, appeals, and clinical events always count; so does any entry
 *  whose choice fields read like a denial, a cancelled, missed, or rescheduled visit, a delay, a hold,
 *  or a lapse. Case-insensitive and on the text, so free-text and custom values count too. */
export const DISRUPTION_TYPES = ['disruption', 'appeal', 'clinical_event'];
export const DISRUPTION_RE = /\b(denied|denial|rejected|cancel+ed|no-show|missed|reschedul\w*|delay\w*|backorder\w*|paused|waiting for further|pending|info requested|partially approved|expired|used up|lapsed)\b/i;
export function disruptionByRule(doc, entry) {
  if (DISRUPTION_TYPES.includes(entry.typeId)) return true;
  const type = typeById(doc, entry.typeId); if (!type) return false;
  return allFields(type).some(f => f.kind === 'select' && DISRUPTION_RE.test(String(entry.values?.[f.id] ?? '')));
}
export function disruptionFilter(doc) {
  const f = (doc.filters || []).find(x => x.id === 'disruptions');
  return { id: 'disruptions', include: [...(f?.include || [])], exclude: [...(f?.exclude || [])] };
}
/** In the filter: by the rule unless removed, or added by hand in Edit Disruption mode. */
export function isDisruption(doc, entry, filter = disruptionFilter(doc)) {
  if (filter.include.includes(entry.id)) return true;
  if (filter.exclude.includes(entry.id)) return false;
  return disruptionByRule(doc, entry);
}
/** The filter record after clicking an entry in Edit Disruption mode (gray ↔ in). */
export function toggleDisruption(doc, entryId) {
  const f = disruptionFilter(doc), entry = entryById(doc, entryId); if (!entry) return f;
  const inNow = isDisruption(doc, entry, f), rule = disruptionByRule(doc, entry);
  f.include = f.include.filter(id => id !== entryId); f.exclude = f.exclude.filter(id => id !== entryId);
  if (inNow && rule) f.exclude.push(entryId);
  if (!inNow && !rule) f.include.push(entryId);
  return f;
}

// ---- Saved views (t27u) ----------------------------------------------------------------
/** Named Timeline filter sets, stored as filter records with ids "view-…" (offline-sync safe:
 *  they ride the same put/delete ops and three-way merge as every other record). */
export const isViewId = id => /^view-[A-Za-z0-9_-]{1,59}$/.test(String(id || ''));
export function savedViews(doc) {
  return (doc.filters || []).filter(f => isViewId(f.id)).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.name).localeCompare(String(b.name)));
}
/** A view record from the Timeline's current filter state. */
export function viewFromState(doc, name, state, id) {
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'view';
  return {
    id: id || `view-${slug}-${Math.random().toString(36).slice(2, 8)}`, kind: 'view', name: String(name).trim().slice(0, 60),
    typeIds: [...state.typeIds], tagIds: [...state.tagIds], disruptions: !!state.disruptions,
    conditionId: state.conditionId || '', range: state.range || 'all', sortOrder: savedViews(doc).length,
  };
}
/** The Timeline state a view restores. Ids that no longer exist are dropped. */
export function stateFromView(doc, view) {
  const typeOk = new Set((doc.types || []).map(t => t.id)), tagOk = new Set((doc.tags || []).map(t => t.id));
  const condOk = (doc.conditions || []).some(c => c.id === view.conditionId);
  return {
    typeIds: new Set((view.typeIds || []).filter(id => typeOk.has(id))), tagIds: new Set((view.tagIds || []).filter(id => tagOk.has(id))),
    disruptions: !!view.disruptions, conditionId: condOk ? view.conditionId : '', range: ['all', 'upcoming', 'past'].includes(view.range) ? view.range : 'all',
  };
}
/** True when the Timeline currently shows exactly this view. */
export function viewIsActive(doc, view, state) {
  const v = stateFromView(doc, view), eq = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
  return eq(v.typeIds, state.typeIds) && eq(v.tagIds, state.tagIds) && v.disruptions === !!state.disruptions && v.conditionId === (state.conditionId || '') && v.range === (state.range || 'all');
}

// ---- Condition short name + description (t30u) ------------------------------------------
export const conditionDescription = c => String(c?.description || '').trim();
/** "Short name [longer description]" typed in the name box splits into the two parts. */
export function splitConditionName(text) {
  const m = /^\s*([^[\]]*?)\s*\[([^\]]*)\]\s*$/.exec(String(text || ''));
  if (!m || !m[1].trim()) return { name: String(text || '').trim(), description: '' };
  return { name: m[1].replace(/\*\s*\)/g, ')').replace(/\*$/, '').trim(), description: m[2].trim() };
}
