// Domain tests for every built-in entry type plus custom types, tags, timeline filters,
// icons, and contrast. Run: node tests/schema.test.mjs   (seed data comes from PHP, the source of truth)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as S from '../js/schema.js';
import { ICON_KEYS, iconSVG, typeBadge, hasIcon } from '../js/icons.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const TODAY = '2026-11-17';
const php = code => JSON.parse(execFileSync(process.env.APPTS_PHP || 'php', ['-r', `require "includes/demo-seed.php"; echo json_encode(${code});`], { cwd: root }).toString());
const demo = php(`demo_doc("${TODAY}")`);
const blank = php('new_doc()');
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };
const eq = (a, b, msg) => { assert.deepEqual(a, b, msg); checks++; };

const BUILTINS = ['doctor', 'visit', 'letter', 'appeal', 'supply', 'care', 'treatment', 'clinical_event', 'insurance_event', 'disruption'];
eq(S.sortTypes(blank.types).map(t => t.id), BUILTINS, 'ten built-in seeds, in order');
eq(new Set(blank.types.map(t => t.icon)).size, 10, 'every built-in has a distinct icon');
ok(blank.types.every(t => hasIcon(t.icon)), 'every built-in icon exists in the SVG set');
eq(new Set(blank.types.map(t => t.color)).size, 10, 'every built-in has a distinct color');

// ---- every built-in type: valid entry, required title/fields, events, links, search, filter
const sampleValue = (doc, f, condId) => ({ text: 'Sample text', longtext: 'Line one\nLine two', date: '2026-12-01', number: 3, select: f.options[0], checkbox: true, link: S.linkTargets(doc, f, condId)[0]?.id ?? '' })[f.kind];
for (const typeId of BUILTINS) {
  const doc = structuredClone(demo);
  const type = S.typeById(doc, typeId);
  const condId = 'cond-knee';
  const entry = { id: `t-${typeId}`, conditionId: condId, typeId, title: `Zebra ${type.singular}`, values: {}, tagIds: ['tag-paperwork'] };
  for (const f of type.fields) entry.values[f.id] = sampleValue(doc, f, condId);
  eq(S.validateEntry(doc, type, entry), [], `${typeId}: fully filled entry is valid`);
  eq(S.validateEntry(doc, type, { ...entry, title: ' ' }).length, 1, `${typeId}: title required`);
  for (const f of type.fields.filter(f => f.required)) ok(S.validateEntry(doc, type, { ...entry, values: { ...entry.values, [f.id]: '' } }).some(e => e.includes(f.label)), `${typeId}: ${f.label} required`);
  for (const f of type.fields.filter(f => f.kind === 'date')) ok(S.validateEntry(doc, type, { ...entry, values: { ...entry.values, [f.id]: '2026-13-01' } }).length === 1, `${typeId}: bad ${f.label} rejected`);
  for (const f of type.fields.filter(f => f.kind === 'number')) ok(S.validateEntry(doc, type, { ...entry, values: { ...entry.values, [f.id]: 'abc' } }).length === 1, `${typeId}: bad ${f.label} rejected`);
  for (const f of type.fields.filter(f => f.kind === 'link')) {
    ok(S.linkTargets(doc, f, condId).every(e => e.typeId === f.target), `${typeId}.${f.id}: link targets are ${f.target}s`);
    ok(S.validateEntry(doc, type, { ...entry, values: { ...entry.values, [f.id]: 'ghost' } }).length === 1, `${typeId}.${f.id}: dangling link rejected`);
  }
  doc.entries.push(entry);
  const events = S.entryEvents(doc, entry);
  eq(events.length, type.fields.filter(f => f.kind === 'date').length, `${typeId}: one event per date field`);
  ok(type.primaryDateField === '' || events.some(e => e.primary), `${typeId}: primary date marked`);
  ok(S.filterEntries(doc, { query: `zebra ${type.singular.split(' ')[0]}` }).some(e => e.id === entry.id), `${typeId}: found by search`);
  ok(S.filterEntries(doc, { typeIds: [typeId] }).every(e => e.typeId === typeId), `${typeId}: type filter exact`);
  ok(S.filterEntries(doc, { typeIds: [typeId], conditionId: condId }).some(e => e.id === entry.id), `${typeId}: condition + type filter`);
  for (const f of type.fields.filter(f => f.kind === 'link' && entry.values[f.id])) ok(S.backlinks(doc, entry.values[f.id]).some(b => b.entry.id === entry.id), `${typeId}.${f.id}: backlink computed`);
  // Every built-in is used by the demo seed and renders a badge
  ok(demo.entries.some(e => e.typeId === typeId), `${typeId}: demo seed uses it`);
  ok(typeBadge(type).includes(`data-icon="${type.icon}"`), `${typeId}: badge renders its icon`);
}

// ---- cross-links in demo: visit→doctor, letter→visit
const backs = S.backlinks(demo, 'doc-ortho').map(b => b.entry.id);
ok(backs.includes('visit-knee-follow') && backs.includes('letter-pt-ref'), 'doctor backlinks include visits and letters');
ok(S.backlinks(demo, 'visit-rad-consult').some(b => b.entry.typeId === 'letter'), 'letter links to visit');

// ---- custom type: create, every field kind, use, reorder, remove (data kept), archive
let custom = S.newType(blank, 'Lab results');
ok(!hasIcon(custom.icon) && iconSVG(custom.icon).includes('data-icon="placeholder"'), 'custom type without icon shows placeholder (G18)');
ok(iconSVG('not-a-real-icon').includes('data-icon="placeholder"'), 'unknown icon key falls back to placeholder (G18)');
for (const kind of S.FIELD_KINDS.map(k => k.kind)) custom = S.addField(custom, { label: `My ${kind}`, kind, options: ['Low', 'Normal'], target: 'visit' });
eq(custom.fields.map(f => f.kind), ['text', 'longtext', 'date', 'number', 'select', 'checkbox', 'link'], 'every field kind added');
assert.throws(() => S.addField(custom, { label: 'my TEXT', kind: 'text' }), /already has/); checks++;
assert.throws(() => S.addField(custom, { label: 'Empty select', kind: 'select', options: [] }), /option/); checks++;
custom = { ...custom, primaryDateField: custom.fields[2].id };
const doc = structuredClone(demo); doc.types.push(custom);
const values = Object.fromEntries(custom.fields.map(f => [f.id, sampleValue(doc, f, 'cond-knee')]));
const labEntry = { id: 'lab-1', conditionId: 'cond-knee', typeId: custom.id, title: 'A1C panel', values, tagIds: [] };
eq(S.validateEntry(doc, custom, labEntry), [], 'custom entry valid'); doc.entries.push(labEntry);
ok(S.allEvents(doc).some(e => e.entryId === 'lab-1' && e.primary), 'custom entry on timeline');
const reloaded = JSON.parse(JSON.stringify(doc));
ok(S.typeById(reloaded, custom.id).fields.length === 7 && S.entryById(reloaded, 'lab-1').values[custom.fields[3].id] === 3, 'custom type + entry survive JSON round trip (G4)');
const moved = S.moveField(custom, custom.fields[6].id, -6);
eq(moved.fields[0].kind, 'link', 'field reordered to top');
const textId = custom.fields[0].id;
const removed = S.removeField(custom, textId);
ok(!removed.fields.some(f => f.id === textId) && removed.retiredFields.some(f => f.id === textId), 'removed field retired');
eq(S.retiredValues(removed, labEntry).map(r => r.value), ['Sample text'], 'retired value still readable');
ok(S.matchesSearch({ ...doc, types: doc.types.map(t => t.id === custom.id ? removed : t) }, labEntry, 'sample text'), 'retired values remain searchable');
eq(S.restoreField(removed, textId).fields.at(-1).id, textId, 'retired field restorable');
const noPrimary = S.removeField(custom, custom.primaryDateField);
eq(noPrimary.primaryDateField, '', 'removing the primary date clears it safely');
ok(S.archiveType(custom).archived && S.activeTypes({ types: [S.archiveType(custom)] }).length === 0, 'archived type hidden from active list');
ok(S.allEvents({ ...doc, types: doc.types.map(t => t.id === custom.id ? S.archiveType(custom) : t) }).some(e => e.entryId === 'lab-1'), 'archived type entries stay on timeline');

// ---- timeline type filter derives from present types (G14)
const knee = S.allEvents(demo, { conditionId: 'cond-knee' });
const kneeTypes = S.timelineTypes(demo, knee).map(x => x.type.id);
eq(new Set(kneeTypes), new Set(knee.map(e => e.typeId)), 'type chips = types present in timeline');
ok(!kneeTypes.includes('doctor'), 'types without date events (doctors) are not offered');
const diabetes = S.allEvents(demo, { conditionId: 'cond-diabetes' });
eq(S.timelineTypes(demo, diabetes).map(x => x.type.id).sort(), ['appeal', 'disruption', 'supply', 'visit'], 'per-condition chips reflect only that condition');
const visitsAndAppeals = S.filterEvents(demo, knee, { typeIds: ['visit', 'appeal'] });
ok(visitsAndAppeals.length && visitsAndAppeals.every(e => ['visit', 'appeal'].includes(e.typeId)) && visitsAndAppeals.length === knee.filter(e => ['visit', 'appeal'].includes(e.typeId)).length, 'type filter (OR) exact');
eq(S.timelineTypes(demo, knee).reduce((n, x) => n + x.count, 0), knee.length, 'type counts add up');

// ---- tags: create on the fly, AND filter (G15, G16)
const pending = [];
const first = S.findOrCreateTag(demo, '  Needs  callback ', pending); pending.push(first.tag);
ok(first.created && first.tag.label === 'Needs callback', 'tag created on the fly, whitespace normalised');
ok(!S.findOrCreateTag(demo, 'needs CALLBACK', pending).created, 'case-insensitive reuse of pending tag');
ok(!S.findOrCreateTag(demo, 'paperwork').created, 'existing tag reused');
const all = S.allEvents(demo);
const one = S.filterEvents(demo, all, { tagIds: ['tag-follow-up'] });
const two = S.filterEvents(demo, all, { tagIds: ['tag-follow-up', 'tag-billing'] });
ok(one.length > two.length && two.length > 0, 'two tags narrow more than one');
ok(two.every(e => e.tagIds.includes('tag-follow-up') && e.tagIds.includes('tag-billing')), 'multi-tag filter is AND');
eq(new Set(S.timelineTags(demo, all).map(x => x.tag.id)), new Set(all.flatMap(e => e.tagIds)), 'tag chips = tags present in timeline');
ok(S.filterEvents(demo, all, { typeIds: ['appeal'], tagIds: ['tag-billing'] }).every(e => e.typeId === 'appeal'), 'type + tag combine');

// ---- upcoming + relative days
const next = S.upcoming(demo, { from: TODAY });
ok(next.every((e, i) => e.date >= TODAY && (i === 0 || next[i - 1].date <= e.date)), 'upcoming sorted, future only');
ok(next.some(e => e.fieldId === 'valid_until'), 'authorization expiry shows as upcoming');
eq([S.relativeDay(TODAY, TODAY), S.relativeDay('2026-11-18', TODAY), S.relativeDay('2026-11-20', TODAY), S.relativeDay('2026-11-15', TODAY)], ['Today', 'Tomorrow', 'In 3 days', '2 days ago'], 'relative day labels');
eq(S.conditionStats(demo, 'cond-skin').next.date >= TODAY, true, 'condition next item');

// ---- contrast (G19)
for (const t of blank.types) ok(S.contrastRatio(t.color, S.readableText(t.color)) >= 4.5, `${t.id} badge ink contrast`);
let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 500; i++) { const c = '#' + Math.floor(rand() * 0xffffff).toString(16).padStart(6, '0'); ok(S.contrastRatio(c, S.readableText(c)) >= 4.5, `random ${c} contrast`); }
for (const c of S.TYPE_COLORS) ok(S.contrastRatio(c, S.readableText(c)) >= 4.5, `swatch ${c} contrast`);
eq(ICON_KEYS.length >= 20, true, 'icon picker offers at least 20 icons');

console.log(`PASS: ${checks} domain checks across ${BUILTINS.length} built-in types, custom types, tags, timeline filters, icons, contrast.`);

// ---- documents (G24, G25)
const D = await import('../js/documents.js');
const docs = D.documentList(demo);
ok(docs.length === 5 && docs.some(d => d.owner.kind === 'condition'), 'documents gathered from entries and conditions');
eq(D.documentKinds(docs).map(k => [k.kind, k.count]), [['pdf', 3], ['image', 2]], 'file-type chips derived from uploads');
eq(new Set(D.documentLabels(demo, docs).map(x => x.label.id)), new Set(docs.map(d => d.labelId)), 'label chips derived from uploads');
ok(D.filterDocuments(docs, { kinds: ['pdf'] }).every(d => d.kind === 'pdf') && D.filterDocuments(docs, { kinds: ['pdf'] }).length === 3, 'filter by file type');
eq(D.filterDocuments(docs, { labelIds: ['lab'] }).map(d => d.file.name), ['Sample lab report.pdf'], 'filter by label');
eq(D.filterDocuments(docs, { kinds: ['image'], labelIds: ['imaging'] }).length, 1, 'type + label combine');
eq(D.filterDocuments(docs, { conditionId: 'cond-diabetes' }).length, 1, 'filter by condition');
eq(D.groupDocuments(demo, docs, 'kind').map(g => g.title), ['PDF', 'Image'], 'group by file type');
ok(D.groupDocuments(demo, docs, 'label')[0].key === 'lab', 'group by label in label order');
const lbl = D.findOrCreateLabel(demo, 'Pathology'); ok(lbl.created, 'custom label created on the fly');
const withLabel = { ...demo, docLabels: [...demo.docLabels, lbl.label] };
ok(!D.findOrCreateLabel(withLabel, 'pathology').created, 'custom label reused');
eq([D.defaultLabelFor({ id: 'visit' }, { visit_kind: 'Lab work' }), D.defaultLabelFor({ id: 'visit' }, {}), D.defaultLabelFor({ id: 'letter' })], ['lab', 'consultation', 'insurance'], 'default labels');
console.log('PASS: document helpers (types, labels, filters, grouping).');
{
  const all = S.upcoming(demo, { from: TODAY }), one = S.upcoming(demo, { from: TODAY, onePerEntry: true });
  const ids = one.map(e => e.entryId);
  ok(ids.length === new Set(ids).size && one.length < all.length, 'Next up shows one event per entry');
  ok(one.every((e, i) => i === 0 || one[i - 1].date <= e.date), 'Next up stays in date order');
  console.log('PASS: next-up dedupe.');
}
{
  // G29/G30: built-in status fields allow free text; the disruption type is "Other care disruptions".
  const dis = S.typeById(demo, 'disruption');
  ok(dis.name === 'Other care disruptions' && dis.singular === 'Other care disruption', 'disruption type renamed');
  const statusFields = demo.types.flatMap(t => t.fields.filter(f => f.label === 'Status').map(f => [t.id, f]));
  ok(statusFields.length === 5 && statusFields.every(([, f]) => f.kind === 'select' && f.allowCustom === true), 'all 5 built-in Status fields allow free text');
  ok(S.typeById(demo, 'doctor').fields.find(f => f.id === 'role').allowCustom === false, 'other built-in selects stay preset-only');
  // G28: typed values are offered again; presets-only fields keep an odd stored value visible.
  const supply = S.typeById(demo, 'supply'), st = supply.fields.find(f => f.id === 'status');
  const ch = S.selectChoices(demo, 'supply', st);
  ok(ch.used.includes('Backordered at pharmacy') && !ch.used.some(v => st.options.includes(v)), 'typed status offered under Used before');
  ok(S.selectChoices(demo, 'supply', st, 'Brand new text').used[0] === 'Brand new text', 'current custom value listed first');
  const role = S.typeById(demo, 'doctor').fields.find(f => f.id === 'role');
  const rc = S.selectChoices(demo, 'doctor', role, 'Odd legacy');
  ok(rc.used.length === 0 && rc.presets.includes('Odd legacy'), 'presets-only select keeps a legacy value without offering free text');
  ok(S.FREE_TEXT && !st.options.includes(S.FREE_TEXT), 'free-text sentinel never collides with an option');
  const t2 = S.addField({ id: 'x', fields: [], retiredFields: [] }, { label: 'Result', kind: 'select', options: ['Low', 'High'], allowCustom: true });
  const t3 = S.addField(t2, { label: 'Note', kind: 'text', allowCustom: true });
  ok(t2.fields[0].allowCustom === true && !('allowCustom' in t3.fields[1]), 'custom select fields can allow free text');
  ok(S.updateField(t2, t2.fields[0].id, { allowCustom: false }).fields[0].allowCustom === false, 'free text can be switched off');
  // A typed status is found by search and by the timeline filter.
  const entry = demo.entries.find(e => e.values?.status === 'Backordered at pharmacy');
  ok(S.matchesSearch(demo, entry, 'backordered'), 'search finds a typed status');
  const evs = S.filterEvents(demo, S.allEvents(demo), { query: 'backordered at pharmacy' });
  ok(evs.length > 0 && evs.every(ev => ev.entryId === entry.id), 'timeline filter finds a typed status');
  console.log('PASS: free-text statuses and Other care disruptions.');
}
