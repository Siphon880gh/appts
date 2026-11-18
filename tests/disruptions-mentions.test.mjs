// Pure helpers for t18u: the Disruptions rule and edits (js/schema.js) and @mention libraries (js/mentions.js).
// Run: node tests/disruptions-mentions.test.mjs   (demo data comes from PHP, the source of truth)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as S from '../js/schema.js';
import { mentionLibraries, filterMentions, mentionTrigger } from '../js/mentions.js';
import { planSync, mergeRecord } from '../js/merge.js';
const root = fileURLToPath(new URL('..', import.meta.url));
const demo = JSON.parse(execFileSync(process.env.APPTS_PHP || 'php', ['-r', 'require "includes/demo-seed.php"; echo json_encode(demo_doc("2026-11-17"));'], { cwd: root }).toString());
let checks = 0;
const ok = (cond, what) => { checks++; assert.ok(cond, what); console.log('  ok -', what); };
const byTitle = t => demo.entries.find(e => e.title === t);

// Disruptions rule
const inRule = demo.entries.filter(e => S.disruptionByRule(demo, e)).map(e => e.title);
ok(inRule.includes('MRI prior authorization denied') && !inRule.includes('Radiation authorization approved'), 'rule: insurance denials in, approvals out');
ok(['disruption', 'appeal', 'clinical_event'].every(t => demo.entries.filter(e => e.typeId === t).every(e => S.disruptionByRule(demo, e))), 'rule: every other care disruption, appeal, and clinical event');
ok(demo.entries.filter(e => e.typeId === 'hh_visit' && /^Missed/.test(e.values.outcome)).every(e => S.disruptionByRule(demo, e)) && !demo.entries.filter(e => e.typeId === 'hh_visit' && e.values.outcome === 'Completed').some(e => S.disruptionByRule(demo, e)), 'rule: missed home health visits in, completed visits out');
ok(S.disruptionByRule(demo, byTitle('Non-stick dressing pads (box of 50)')), 'rule: free-text status "Backordered at pharmacy" counts');
const custom = { ...demo, types: [...demo.types, { id: 'pharmacy', name: 'Pharmacy', singular: 'Pharmacy', fields: [{ id: 'state', label: 'State', kind: 'select', options: ['Filled', 'Claim rejected'] }] }] };
ok(S.disruptionByRule(custom, { id: 'x', typeId: 'pharmacy', values: { state: 'Claim rejected' } }) && !S.disruptionByRule(custom, { id: 'y', typeId: 'pharmacy', values: { state: 'Filled' } }), 'rule: custom types count by their choice values');
ok(!S.disruptionByRule(demo, { id: 'z', typeId: 'visit', values: { status: 'Completed', location: 'Rescheduled from June' } }), 'rule: only choice fields, not free text in other fields');

// Edit Disruption mode toggles
let doc = structuredClone(demo);
const add = byTitle('Called the home health case manager'), drop = byTitle('Knee swelling after stairs');
let f = S.toggleDisruption(doc, add.id); doc.filters = [f];
ok(S.isDisruption(doc, add) && f.include.includes(add.id), 'toggle: a grayed entry is added (include)');
f = S.toggleDisruption(doc, drop.id); doc.filters = [f];
ok(!S.isDisruption(doc, drop) && f.exclude.includes(drop.id), 'toggle: an entry in by the rule is removed (exclude)');
f = S.toggleDisruption(doc, add.id); doc.filters = [f]; f = S.toggleDisruption(doc, drop.id); doc.filters = [f];
ok(!f.include.length && !f.exclude.length, 'toggle: clicking again returns to the built-in rule with no leftovers');
ok(S.disruptionFilter({ entries: [] }).include.length === 0, 'no saved filter: the built-in rule alone');

// Offline sync of the filter record
const base = { id: 'disruptions', include: ['a'], exclude: [] };
const m = mergeRecord('filter', base, { ...base, include: ['a', 'b'] }, { ...base, include: [], exclude: ['c'] });
ok(JSON.stringify(m.value.include) === '["b"]' && JSON.stringify(m.value.exclude) === '["c"]' && !m.conflicts.length, 'sync: filter edits from both sides merge as sets');
const plan = planSync([{ key: 'k', kind: 'filter', id: 'disruptions', base: null, ours: { id: 'disruptions', include: ['b'], exclude: [] } }, { key: 'e', kind: 'entry', id: 'n', base: null, ours: { id: 'n', title: 'x' } }], { filters: [], entries: [] });
ok(plan.ops.map(o => o.op.kind).join() === 'entry,filter', 'sync: the filter is sent after entries');

// @mention libraries
const libs = mentionLibraries(demo);
ok(libs.map(l => l.label).join() === 'Documents,Events,Notes', 'libraries: Documents, Events, Notes');
const fileIds = new Set([...demo.conditions, ...demo.entries].flatMap(r => (r.attachments || []).map(a => a.id)));
ok(libs[0].items.length === fileIds.size && libs[0].items.every(i => i.kind === 'file' && /\.(pdf|png|jpg|gif|webp)$/.test(i.ref)), 'Documents: every uploaded file once');
ok(libs[1].items.length === demo.entries.length, 'Events: every entry');
ok(libs[2].items.length && libs[2].items.every(i => i.chip.startsWith('@Notes: ')), 'Notes: records with notes, chip says Notes');
const mri = filterMentions(libs, 'mri'), knee = filterMentions(libs, 'knee');
ok(mri.length === 2 && mri.every(i => i.search.includes('mri')), 'filter: "mri" keeps only matching items');
ok(new Set(knee.map(i => i.library)).size >= 2, 'filter: one query searches every library at once');
ok(filterMentions(libs, 'notes').every(i => i.library === 'Notes') && filterMentions(libs, 'doc pdf').every(i => i.library === 'Documents'), 'filter: a library name narrows to that library');
ok(filterMentions(libs, '').length === 30, 'filter: capped at 30 results');
ok(mentionTrigger('See @').query === '' && mentionTrigger('See @cbc res').query === 'cbc res' && mentionTrigger('Bring @').start === 6, 'trigger: @ after a space opens it');
ok(mentionTrigger('mail me at a@b') === null && mentionTrigger('plain text') === null, 'trigger: not inside an email address');
console.log(`disruptions-mentions.test.mjs: ${checks} checks passed`);
