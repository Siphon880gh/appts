// Pure helpers for the Documents page and document labels (no DOM).
import { newId, TYPE_COLORS } from './schema.js';

export const KIND_NAMES = { pdf: 'PDF', image: 'Image' };
export const fileKind = a => (a.kind === 'pdf' || /\.pdf$/.test(a.id || '')) ? 'pdf' : 'image';
export const labelById = (doc, id) => (doc.docLabels || []).find(l => l.id === id) || (doc.docLabels || []).find(l => l.id === 'other') || { id: 'other', label: 'Other' };

/** Every upload attached to an entry or a condition, newest first. */
export function documentList(doc) {
  const out = [];
  const conditionName = id => doc.conditions.find(c => c.id === id)?.name || '';
  for (const c of doc.conditions) for (const a of c.attachments || []) out.push({ key: `c:${c.id}:${a.id}`, file: a, kind: fileKind(a), labelId: labelById(doc, a.label).id, conditionId: c.id, conditionName: c.name, owner: { kind: 'condition', id: c.id, title: c.name } });
  for (const e of doc.entries) for (const a of e.attachments || []) out.push({ key: `e:${e.id}:${a.id}`, file: a, kind: fileKind(a), labelId: labelById(doc, a.label).id, conditionId: e.conditionId, conditionName: conditionName(e.conditionId), owner: { kind: 'entry', id: e.id, title: e.title, typeId: e.typeId } });
  return out.sort((a, b) => String(b.file.addedAt || '').localeCompare(String(a.file.addedAt || '')) || a.file.name.localeCompare(b.file.name));
}
export function documentKinds(list) {
  return ['pdf', 'image'].map(kind => ({ kind, label: KIND_NAMES[kind], count: list.filter(d => d.kind === kind).length })).filter(k => k.count);
}
export function documentLabels(doc, list) {
  return (doc.docLabels || []).map(label => ({ label, count: list.filter(d => d.labelId === label.id).length })).filter(x => x.count);
}
export function filterDocuments(list, { kinds = [], labelIds = [], conditionId = '', query = '' } = {}) {
  const k = new Set(kinds), l = new Set(labelIds), words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter(d => (!k.size || k.has(d.kind)) && (!l.size || l.has(d.labelId)) && (!conditionId || d.conditionId === conditionId)
    && words.every(w => `${d.file.name} ${d.owner.title} ${d.conditionName}`.toLowerCase().includes(w)));
}
export function groupDocuments(doc, list, by = 'label') {
  const groups = new Map();
  for (const d of list) {
    const key = by === 'kind' ? d.kind : d.labelId;
    if (!groups.has(key)) groups.set(key, { key, title: by === 'kind' ? KIND_NAMES[key] : labelById(doc, key).label, items: [] });
    groups.get(key).items.push(d);
  }
  const order = by === 'kind' ? ['pdf', 'image'] : (doc.docLabels || []).map(l => l.id);
  return [...groups.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}
/** Sensible default label for an upload on this entry. */
export function defaultLabelFor(type, values = {}) {
  const kind = values.visit_kind || '';
  if (kind === 'Lab work') return 'lab';
  if (kind === 'Imaging') return 'imaging';
  if (type?.id === 'visit') return 'consultation';
  if (['letter', 'appeal', 'insurance_event'].includes(type?.id)) return 'insurance';
  if (['care', 'clinical_event'].includes(type?.id)) return 'progress';
  return 'other';
}
export function findOrCreateLabel(doc, text, pending = []) {
  const clean = String(text).trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!clean) return null;
  const existing = [...(doc.docLabels || []), ...pending].find(l => l.label.toLowerCase() === clean.toLowerCase());
  if (existing) return { label: existing, created: false };
  return { label: { id: newId('label'), label: clean, color: TYPE_COLORS[pending.length % TYPE_COLORS.length] }, created: true };
}
export function formatBytes(n) {
  if (!n) return '';
  return n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}
