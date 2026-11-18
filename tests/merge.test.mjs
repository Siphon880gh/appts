// Offline sync merge rules (js/merge.js): never lose data. Run: node tests/merge.test.mjs
import assert from 'node:assert/strict';
import { applyLocal, overlay, mergeRecord, planSync, remapIds, same } from '../js/merge.js';
let checks = 0;
const ok = (cond, what) => { checks++; assert.ok(cond, what); console.log('  ok -', what); };

const entry = (over = {}) => ({ id: 'e1', conditionId: 'c1', typeId: 'visit', title: 'Visit', values: { date: '2026-11-01', location: 'Clinic A', doctor: 'd1' }, tagIds: ['t1'], attachments: [{ id: 'a'.repeat(64) + '.pdf', name: 'a.pdf' }], notes: { html: '<p>base</p>', text: 'base', imageIds: [] }, updatedAt: '2026-11-01T00:00:00Z', ...over });
const doc = () => ({ revision: 1, conditions: [{ id: 'c1', name: 'Knee' }], types: [{ id: 'visit', name: 'Visits', fields: [{ id: 'date', label: 'Date', kind: 'date' }] }], entries: [entry()], tags: [{ id: 't1', name: 'urgent' }], docLabels: [{ id: 'other', label: 'Other' }] });

// applyLocal mirrors the server rules that matter offline
let d = applyLocal(doc(), [{ op: 'put', kind: 'entry', value: { ...entry(), title: 'Edited', values: { location: 'Clinic B' } } }]);
ok(d.entries[0].title === 'Edited' && d.entries[0].values.date === '2026-11-01' && d.entries[0].values.location === 'Clinic B', 'applyLocal: an entry edit keeps values it did not send (like clean_entry)');
d = applyLocal(doc(), [{ op: 'put', kind: 'entry', value: { ...entry({ id: 'e2' }), notes: { html: `<p><img data-image-id="${'b'.repeat(64)}.png"></p>` } } }]);
ok(d.entries.length === 2 && d.entries[1].notes.imageIds[0] === 'b'.repeat(64) + '.png', 'applyLocal: new entry; note image ids derived like image_ids_in()');
assert.throws(() => applyLocal(doc(), [{ op: 'delete', kind: 'condition', id: 'c1' }]), /entries first/); ok(true, 'applyLocal: a condition with entries cannot be deleted');
assert.throws(() => applyLocal(doc(), [{ op: 'delete', kind: 'type', id: 'visit' }]), /Archive/); ok(true, 'applyLocal: types cannot be deleted');
d = applyLocal(doc(), [{ op: 'delete', kind: 'tag', id: 't1' }]);
ok(!d.tags.length && !d.entries[0].tagIds.length, 'applyLocal: deleting a tag removes it from entries');

// overlay
d = overlay(doc(), [{ kind: 'entry', id: 'e1', ours: entry({ title: 'Ours' }) }, { kind: 'tag', id: 't1', ours: null }, { kind: 'entry', id: 'e9', ours: entry({ id: 'e9' }) }]);
ok(d.entries[0].title === 'Ours' && d.entries.length === 2 && !d.tags.length, 'overlay: queued puts replace/add, queued deletes remove');

// mergeRecord
const base = entry();
let m = mergeRecord('entry', base, entry({ title: 'Ours' }), entry({ values: { ...base.values, location: 'Server' } }));
ok(m.value.title === 'Ours' && m.value.values.location === 'Server' && !m.conflicts.length, 'merge: different fields changed on each side are both kept');
m = mergeRecord('entry', base, entry({ values: { ...base.values, location: 'Ours' } }), entry({ values: { ...base.values, location: 'Server' } }));
ok(m.value.values.location === 'Server' && m.conflicts[0].field === 'values.location' && m.value.notes.html.includes('Ours') && m.value.notes.html.startsWith('<p>base</p>'), 'merge: same field on both sides keeps the server value and records ours in the notes');
m = mergeRecord('entry', base, entry({ tagIds: ['t1', 't2'] }), entry({ tagIds: [] }));
ok(same(m.value.tagIds, ['t2']), 'merge: tag lists merge three-way (server removed t1, we added t2)');
const pdf2 = { id: 'c'.repeat(64) + '.pdf', name: 'c.pdf' }, img = { id: 'd'.repeat(64) + '.png', name: 'd.png' };
m = mergeRecord('entry', base, entry({ attachments: [...base.attachments, pdf2] }), entry({ attachments: [...base.attachments, img] }));
ok(m.value.attachments.length === 3, 'merge: documents attached on both sides are all kept');
m = mergeRecord('entry', base, entry({ notes: { html: '<p>ours</p>' } }), entry({ notes: { html: '<p>server</p>' } }));
ok(m.value.notes.html.includes('server') && m.value.notes.html.includes('ours'), 'merge: notes edited on both sides keep both texts');
const tBase = { id: 'visit', name: 'Visits', fields: [{ id: 'date', label: 'Date' }] };
m = mergeRecord('type', tBase, { ...tBase, fields: [...tBase.fields, { id: 'room', label: 'Room' }] }, { ...tBase, name: 'Appointments', fields: [...tBase.fields, { id: 'copay', label: 'Copay' }] });
ok(m.value.name === 'Appointments' && same(m.value.fields.map(f => f.id), ['date', 'copay', 'room']), 'merge: type fields added on both sides are unioned by id');

// planSync
const server = doc();
server.entries[0] = entry({ values: { ...base.values, location: 'Server' } });
server.entries.push(entry({ id: 'e3', title: 'Changed on server' }));
const pending = [
  { key: 'k1', kind: 'entry', id: 'e1', base, ours: entry({ title: 'Ours' }) },
  { key: 'k2', kind: 'entry', id: 'e3', base: entry({ id: 'e3' }), ours: null },
  { key: 'k3', kind: 'entry', id: 'e4', base: null, ours: entry({ id: 'e4' }) },
  { key: 'k4', kind: 'entry', id: 'gone', base: entry({ id: 'gone' }), ours: entry({ id: 'gone', title: 'Edited after server deleted' }) },
  { key: 'k5', kind: 'tag', id: 't2', base: null, ours: { id: 't2', name: 'new' } },
  { key: 'k6', kind: 'entry', id: 'e1x', base: null, ours: null },
];
const plan = planSync(pending, server);
ok(plan.ops[0].op.kind === 'tag', 'sync order: tags before entries (server checks references)');
const put1 = plan.ops.find(o => o.key === 'k1').op.value;
ok(put1.title === 'Ours' && put1.values.location === 'Server', 'sync: modified on both sides is merged, not overwritten');
ok(!plan.ops.some(o => o.key === 'k2') && plan.report.some(r => r.key === 'k2' && /kept instead of deleted/.test(r.note)), 'sync: an offline delete of a record changed on the server keeps it and says so');
ok(plan.ops.some(o => o.key === 'k3' && o.op.op === 'put'), 'sync: a record created offline is put');
ok(plan.ops.some(o => o.key === 'k4') && plan.report.some(r => r.key === 'k4' && /restored/.test(r.note)), 'sync: edited offline but deleted on the server is restored, and reported');
ok(!plan.ops.some(o => o.key === 'k6'), 'sync: created then deleted offline sends nothing');
const plan2 = planSync([{ key: 'd', kind: 'entry', id: 'e3', base: entry({ id: 'e3', title: 'Changed on server' }), ours: null }], server);
ok(plan2.ops.length === 1 && plan2.ops[0].op.op === 'delete', 'sync: an offline delete of an unchanged record is sent');
ok(same(remapIds({ a: 'x'.repeat(3) + '.png', b: ['xxx.png'] }, { 'xxx.png': 'yyy.png' }), { a: 'yyy.png', b: ['yyy.png'] }), 'sync: a file id assigned differently by the server is remapped everywhere');
// Saved views (t27u) and condition descriptions (t30u) ride the same offline sync.
{
  const view = { id: 'view-blocked-abc123', kind: 'view', name: 'Blocked', typeIds: [], tagIds: ['t1'], disruptions: false, conditionId: '', range: 'all' };
  let v = applyLocal(doc(), [{ op: 'put', kind: 'filter', value: view }]);
  ok(v.filters.length === 1 && v.filters[0].name === 'Blocked', 'views: a saved view put offline lands in filters');
  v = applyLocal(v, [{ op: 'delete', kind: 'tag', id: 't1' }]);
  ok(same(v.filters[0].tagIds, []), 'views: deleting a tag offline strips it from saved views too');
  v = applyLocal(v, [{ op: 'delete', kind: 'filter', id: view.id }]);
  ok(v.filters.length === 0, 'views: a saved view can be deleted offline');
  let threw = false; try { applyLocal(doc(), [{ op: 'delete', kind: 'filter', id: 'disruptions' }]); } catch { threw = true; }
  ok(threw, 'views: the built-in Disruptions filter cannot be deleted offline');
  const srv = { ...doc(), filters: [view] };
  const p = planSync([{ key: 'v1', kind: 'filter', id: view.id, base: view, ours: null }], srv);
  ok(p.ops.length === 1 && p.ops[0].op.op === 'delete' && p.ops[0].op.kind === 'filter', 'views: an offline delete of an unchanged view is sent at sync');
  const mv = mergeRecord('filter', view, { ...view, tagIds: ['t1', 't2'] }, { ...view, name: 'Blocked / hiccups' });
  ok(mv.value.name === 'Blocked / hiccups' && same([...mv.value.tagIds].sort(), ['t1', 't2']), 'views: a rename on the server and a tag added offline both survive');
  const c0 = { id: 'c1', name: 'Knee', description: '' };
  const mc = mergeRecord('condition', c0, { ...c0, description: 'Left knee OA, grade 3' }, { ...c0, name: 'Left knee' });
  ok(mc.value.name === 'Left knee' && mc.value.description === 'Left knee OA, grade 3', 'conditions: a description added offline merges with a rename on the server');
}
console.log(`merge.test.mjs: ${checks} checks passed`);
